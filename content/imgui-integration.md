# Adding ImGui to the Vulkan starter

We're making three structural changes:

1. **New resource**: a descriptor pool that ImGui owns.
2. **Lifecycle**: init ImGui after the swapchain, shut it down before the device.
3. **Render loop**: replace `vkCmdClearColorImage` + `TRANSFER_DST_OPTIMAL` with `vkCmdBeginRendering` + `COLOR_ATTACHMENT_OPTIMAL`. The clear becomes the attachment's `loadOp`, and ImGui draws into the same pass.

The dynamic-rendering feature is already on from step 5 of the starter. No new device features or extensions are needed.

This assumes you've already applied the per-swapchain-image `renderDone` fix from the previous step.

---

## 1. Headers

Add at the top of `main.cpp`:

```cpp
#include <imgui.h>
#include <imgui_impl_sdl3.h>
#include <imgui_impl_vulkan.h>
```

These resolve because `vcpkg.json` pulled ImGui with the `vulkan-binding` and `sdl3-binding` features.

---

## 2. `App` struct — one new field

```cpp
struct App {
    // ... everything you already have ...
    VkDescriptorPool imguiPool = VK_NULL_HANDLE;
};
```

ImGui allocates its font texture descriptor (and descriptors for any user-added textures) out of this pool.

---

## 3. `initImGui` — new function

Drop this in above `main`:

```cpp
static void initImGui(App& a) {
    // ImGui asks for a pool of each descriptor type. The sizes here are
    // ImGui's recommended overkill values — fine for anything short of a
    // texture-heavy editor UI.
    VkDescriptorPoolSize poolSizes[] = {
        { VK_DESCRIPTOR_TYPE_SAMPLER,                1000 },
        { VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1000 },
        { VK_DESCRIPTOR_TYPE_SAMPLED_IMAGE,          1000 },
        { VK_DESCRIPTOR_TYPE_STORAGE_IMAGE,          1000 },
        { VK_DESCRIPTOR_TYPE_UNIFORM_TEXEL_BUFFER,   1000 },
        { VK_DESCRIPTOR_TYPE_STORAGE_TEXEL_BUFFER,   1000 },
        { VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,         1000 },
        { VK_DESCRIPTOR_TYPE_STORAGE_BUFFER,         1000 },
        { VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC, 1000 },
        { VK_DESCRIPTOR_TYPE_STORAGE_BUFFER_DYNAMIC, 1000 },
        { VK_DESCRIPTOR_TYPE_INPUT_ATTACHMENT,       1000 },
    };

    VkDescriptorPoolCreateInfo pci{VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO};
    pci.flags         = VK_DESCRIPTOR_POOL_CREATE_FREE_DESCRIPTOR_SET_BIT;
    pci.maxSets       = 1000;
    pci.poolSizeCount = uint32_t(std::size(poolSizes));
    pci.pPoolSizes    = poolSizes;
    VK_CHECK(vkCreateDescriptorPool(a.device, &pci, nullptr, &a.imguiPool));

    // Core ImGui
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    ImGui::StyleColorsDark();

    // SDL3 backend — handles input, clipboard, cursors
    ImGui_ImplSDL3_InitForVulkan(a.window);

    // Vulkan backend. We're using dynamic rendering, so no render pass;
    // instead we describe the attachment format we'll be rendering into.
    VkPipelineRenderingCreateInfo pipelineRendering{
        VK_STRUCTURE_TYPE_PIPELINE_RENDERING_CREATE_INFO};
    pipelineRendering.colorAttachmentCount    = 1;
    pipelineRendering.pColorAttachmentFormats = &a.swapFormat;

    ImGui_ImplVulkan_InitInfo init{};
    init.Instance            = a.instance;
    init.PhysicalDevice      = a.physical;
    init.Device              = a.device;
    init.QueueFamily         = a.queueFamily;
    init.Queue               = a.queue;
    init.DescriptorPool      = a.imguiPool;
    init.MinImageCount       = uint32_t(a.swapImages.size());
    init.ImageCount          = uint32_t(a.swapImages.size());
    init.MSAASamples         = VK_SAMPLE_COUNT_1_BIT;
    init.UseDynamicRendering = true;
    init.PipelineRenderingCreateInfo = pipelineRendering;

    ImGui_ImplVulkan_Init(&init);
    // Recent ImGui creates the font texture lazily on first RenderDrawData.
    // No explicit upload step needed.
}
```

Call it from `main` **after** `createSwapchain` and `initFrames`:

```cpp
createSwapchain(app);
initFrames(app);
initImGui(app);          // <-- new
```

---

## 4. Event handling — one line

In the `SDL_PollEvent` loop:

```cpp
while (SDL_PollEvent(&ev)) {
    ImGui_ImplSDL3_ProcessEvent(&ev);    // <-- new, call for every event
    if (ev.type == SDL_EVENT_QUIT) running = false;
    if (ev.type == SDL_EVENT_WINDOW_RESIZED) app.needsResize = true;
}
```

This feeds keyboard/mouse/text events into ImGui's IO state. It must happen before `ImGui::NewFrame`.

---

## 5. `drawFrame` — rewrite the render section

This is the meaty change. We're replacing the whole "`TRANSFER_DST_OPTIMAL` → `vkCmdClearColorImage` → `PRESENT_SRC_KHR`" sequence with a proper rendering scope.

Replace everything in `drawFrame` between `vkBeginCommandBuffer` and `vkEndCommandBuffer` with:

```cpp
VkImage img = a.swapImages[imgIdx];

// --- Build ImGui frame BEFORE recording commands ---
ImGui_ImplVulkan_NewFrame();
ImGui_ImplSDL3_NewFrame();
ImGui::NewFrame();

// Example UI — replace with your own.
ImGui::ShowDemoWindow();
{
    ImGui::Begin("Hello");
    ImGui::Text("Frame %llu", (unsigned long long)a.tick);
    ImGui::Text("Swapchain: %ux%u, %zu images",
                a.swapExtent.width, a.swapExtent.height, a.swapImages.size());
    ImGui::End();
}

ImGui::Render();
ImDrawData* drawData = ImGui::GetDrawData();

// --- Transition for color rendering ---
imageBarrier(f.cmd, img,
             VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL,
             VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT, 0,
             VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
             VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT);

// --- Dynamic rendering: clear via loadOp, then draw ImGui on top ---
float t = float(a.tick++) * 0.01f;
VkClearValue clearValue{};
clearValue.color.float32[0] = 0.5f + 0.5f * std::sin(t);
clearValue.color.float32[1] = 0.5f + 0.5f * std::sin(t + 2.0f);
clearValue.color.float32[2] = 0.5f + 0.5f * std::sin(t + 4.0f);
clearValue.color.float32[3] = 1.0f;

VkRenderingAttachmentInfo colorAttach{VK_STRUCTURE_TYPE_RENDERING_ATTACHMENT_INFO};
colorAttach.imageView   = a.swapViews[imgIdx];
colorAttach.imageLayout = VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;
colorAttach.loadOp      = VK_ATTACHMENT_LOAD_OP_CLEAR;
colorAttach.storeOp     = VK_ATTACHMENT_STORE_OP_STORE;
colorAttach.clearValue  = clearValue;

VkRenderingInfo renderInfo{VK_STRUCTURE_TYPE_RENDERING_INFO};
renderInfo.renderArea.offset    = {0, 0};
renderInfo.renderArea.extent    = a.swapExtent;
renderInfo.layerCount           = 1;
renderInfo.colorAttachmentCount = 1;
renderInfo.pColorAttachments    = &colorAttach;

vkCmdBeginRendering(f.cmd, &renderInfo);
ImGui_ImplVulkan_RenderDrawData(drawData, f.cmd);
vkCmdEndRendering(f.cmd);

// --- Transition for presentation ---
imageBarrier(f.cmd, img,
             VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL, VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
             VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT,
             VK_ACCESS_2_COLOR_ATTACHMENT_WRITE_BIT,
             VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT, 0);
```

Two things worth noticing:

- The ImGui frame is *built* outside the command buffer (CPU work) and then *recorded* inside `vkCmdBeginRendering` (GPU work). `RenderDrawData` is the only ImGui call that touches the command buffer.
- The clear color moved from a manual `vkCmdClearColorImage` call to `VkRenderingAttachmentInfo::clearValue` with `VK_ATTACHMENT_LOAD_OP_CLEAR`. Same visual result, one fewer barrier.

---

## 6. Swapchain recreation — notify ImGui

When the window resizes and you rebuild the swapchain, the image count *might* change (e.g., going between windowed and fullscreen on some drivers). Tell ImGui if it does. In `recreateSwapchain`:

```cpp
static void recreateSwapchain(App& a) {
    vkDeviceWaitIdle(a.device);
    destroySwapchain(a);
    createSwapchain(a);
    ImGui_ImplVulkan_SetMinImageCount(uint32_t(a.swapImages.size()));  // <-- new
}
```

The swapchain format and render target dimensions are picked up automatically by `VkRenderingInfo` each frame, so there's nothing else to update on ImGui's side.

---

## 7. Cleanup — tear down in reverse order

In `cleanup`, add the ImGui shutdown *after* `vkDeviceWaitIdle` and *before* any Vulkan destruction:

```cpp
static void cleanup(App& a) {
    if (a.device) vkDeviceWaitIdle(a.device);

    // ImGui teardown — must happen while device is still alive
    ImGui_ImplVulkan_Shutdown();
    ImGui_ImplSDL3_Shutdown();
    ImGui::DestroyContext();
    if (a.imguiPool) vkDestroyDescriptorPool(a.device, a.imguiPool, nullptr);

    // ... the rest of your existing cleanup ...
}
```

Order matters. ImGui's Vulkan backend holds device-owned objects (pipeline, buffers, font image); they must be destroyed before `vkDestroyDevice`.

---

## 8. Build and run

```bash
cmake --build build
./build/app
```

You should see the clear-color background still cycling, with the ImGui demo window and a small "Hello" window floating on top. Drag them around, collapse them, play with the demo's sliders — that's proof the input plumbing works end-to-end.

---

## 9. Troubleshooting

- **Linker error on `ImGui_ImplVulkan_*` or `ImGui_ImplSDL3_*`.** The vcpkg `imgui` port was installed without the backends. Check `vcpkg.json` has `"features": ["vulkan-binding", "sdl3-binding"]` on the imgui entry, delete `vcpkg_installed/` and `build/`, reconfigure.
- **ImGui renders but the clear color is gone (black background).** You're probably hitting `vkCmdBeginRendering` twice, or `loadOp` got set to `LOAD` instead of `CLEAR`. The `loadOp = CLEAR` is what paints the background.
- **Validation: "image layout `UNDEFINED` used as color attachment".** The pre-render barrier is missing or has the wrong `newLayout`. Should be `VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL`.
- **Validation: "pipeline's rendering info does not match".** The format in `PipelineRenderingCreateInfo` at ImGui init time must match `a.swapFormat`. If you change swapchain format selection logic, re-init ImGui's Vulkan backend — or, in practice, just make sure `a.swapFormat` is set by the time `initImGui` runs.
- **Input goes to the app when it should go to ImGui** (e.g. clicking a button also moves the camera). Check `ImGui::GetIO().WantCaptureMouse` / `WantCaptureKeyboard` before routing events to your own game logic. This is the standard gating pattern:
  ```cpp
  ImGui_ImplSDL3_ProcessEvent(&ev);
  if (ImGui::GetIO().WantCaptureMouse && ev.type == SDL_EVENT_MOUSE_BUTTON_DOWN)
      continue;  // ImGui gets it, game doesn't
  ```

---

## 10. What's next

With ImGui up, the natural progression is now about drawing *your own* stuff into the same render pass:

- Add a graphics pipeline (shader modules from SPIR-V, pipeline layout, `VkGraphicsPipelineCreateInfo` with `VkPipelineRenderingCreateInfo` in `pNext` mirroring ImGui's setup).
- Compile a minimal vertex/fragment shader pair with `glslc` as part of the build. A CMake custom command is the usual way.
- Allocate a vertex buffer with VMA, `vkCmdBindPipeline` + `vkCmdBindVertexBuffers` + `vkCmdDraw`, and you've got a triangle.
- Use glm for model/view/projection, push-constant the MVP matrix, and the ImGui window can now have real-time sliders that control the geometry — which is where ImGui starts paying for itself.
