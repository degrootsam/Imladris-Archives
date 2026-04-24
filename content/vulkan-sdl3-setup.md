# SDL3 + Vulkan + VMA + glm + ImGui starter (CMake / vcpkg)

End state: a window pops up and presents a slowly cycling clear color. Dependencies are fetched by vcpkg in manifest mode, the project is plain CMake, and Vulkan is targeted at 1.3 so we get `synchronization2` out of the box.

---

## 1. Prerequisites

Install these once, globally:

- **CMake** ≥ 3.25
- **C++20 compiler** — MSVC 2022, Clang ≥ 15, or GCC ≥ 12
- **Vulkan SDK** from LunarG: <https://vulkan.lunarg.com/>. Make sure the `VULKAN_SDK` env var is set after install (the installer does it on Windows; on Linux/macOS source the `setup-env.sh` in your shell profile).
- **vcpkg** bootstrapped somewhere stable:

  ```bash
  git clone https://github.com/microsoft/vcpkg.git
  cd vcpkg
  ./bootstrap-vcpkg.sh        # or bootstrap-vcpkg.bat on Windows
  ```

  Then set `VCPKG_ROOT` to that path, or remember it for the preset below.

The Vulkan SDK is what gives you the validation layers, `glslc`/`glslangValidator`, and `vulkaninfo`. The vcpkg `vulkan` port just verifies the SDK is present — it doesn't replace it.

---

## 2. Project layout

```
vk-starter/
├── CMakeLists.txt
├── CMakePresets.json
├── vcpkg.json
└── src/
    ├── main.cpp
    └── vma_impl.cpp
```

---

## 3. `vcpkg.json`

Manifest mode — vcpkg reads this at configure time and installs everything into a per-project `vcpkg_installed/` folder.

```json
{
  "name": "vk-starter",
  "version": "0.1.0",
  "dependencies": [
    "sdl3",
    "vulkan",
    "vulkan-memory-allocator",
    "glm",
    {
      "name": "imgui",
      "features": ["vulkan-binding", "sdl3-binding"]
    }
  ]
}
```

The `vulkan-binding` and `sdl3-binding` features tell vcpkg to compile `imgui_impl_vulkan.cpp` and `imgui_impl_sdl3.cpp` into the installed ImGui library, so you can `#include` those backends directly.

---

## 4. `CMakePresets.json`

Presets keep the toolchain path out of your CMake invocation. Replace the `VCPKG_ROOT` env var reference with a hard path if you prefer.

```json
{
  "version": 3,
  "cmakeMinimumRequired": { "major": 3, "minor": 25, "patch": 0 },
  "configurePresets": [
    {
      "name": "default",
      "generator": "Ninja",
      "binaryDir": "${sourceDir}/build",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Debug",
        "CMAKE_TOOLCHAIN_FILE": "$env{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake"
      }
    },
    {
      "name": "release",
      "inherits": "default",
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Release" }
    }
  ]
}
```

---

## 5. `CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.25)
project(vk_starter LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Vulkan REQUIRED)
find_package(SDL3 CONFIG REQUIRED)
find_package(VulkanMemoryAllocator CONFIG REQUIRED)
find_package(glm CONFIG REQUIRED)
find_package(imgui CONFIG REQUIRED)

add_executable(app
    src/main.cpp
    src/vma_impl.cpp
)

target_link_libraries(app PRIVATE
    Vulkan::Vulkan
    SDL3::SDL3
    GPUOpen::VulkanMemoryAllocator
    glm::glm
    imgui::imgui
)

# Optional: enable Vulkan validation layer lookup in debug builds
target_compile_definitions(app PRIVATE
    $<$<CONFIG:Debug>:APP_USE_VALIDATION=1>
)
```

Two things to note:

- `find_package(Vulkan REQUIRED)` is CMake's built-in module; it finds the SDK and gives you `Vulkan::Vulkan`.
- VMA's vcpkg port exposes the target as `GPUOpen::VulkanMemoryAllocator`. It's header-only — the separate `vma_impl.cpp` exists only to instantiate the implementation in one translation unit.

---

## 6. `src/vma_impl.cpp`

Just this — it compiles VMA's implementation into your binary.

```cpp
#define VMA_IMPLEMENTATION
#include <vk_mem_alloc.h>
```

---

## 7. `src/main.cpp`

This is the bulk of it. It initializes SDL3, builds a Vulkan 1.3 instance + device, sets up VMA, creates a swapchain, and in the render loop clears each swapchain image to a time-varying color using `vkCmdClearColorImage` (no render pass needed). Window resize recreates the swapchain.

```cpp
#include <SDL3/SDL.h>
#include <SDL3/SDL_vulkan.h>
#include <vulkan/vulkan.h>
#include <vk_mem_alloc.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <vector>

#define VK_CHECK(expr)                                              \
    do {                                                            \
        VkResult _res = (expr);                                     \
        if (_res != VK_SUCCESS) {                                   \
            std::fprintf(stderr, "Vulkan error %d at %s:%d\n",      \
                         int(_res), __FILE__, __LINE__);            \
            std::abort();                                           \
        }                                                           \
    } while (0)

static constexpr uint32_t FRAMES_IN_FLIGHT = 2;

struct FrameData {
    VkCommandPool   pool          = VK_NULL_HANDLE;
    VkCommandBuffer cmd           = VK_NULL_HANDLE;
    VkSemaphore     imageReady    = VK_NULL_HANDLE;
    VkSemaphore     renderDone    = VK_NULL_HANDLE;
    VkFence         inFlight      = VK_NULL_HANDLE;
};

struct App {
    SDL_Window*        window          = nullptr;
    int                width           = 1280;
    int                height          = 720;

    VkInstance         instance        = VK_NULL_HANDLE;
    VkSurfaceKHR       surface         = VK_NULL_HANDLE;
    VkPhysicalDevice   physical        = VK_NULL_HANDLE;
    VkDevice           device          = VK_NULL_HANDLE;
    uint32_t           queueFamily     = 0;
    VkQueue            queue           = VK_NULL_HANDLE;

    VmaAllocator       allocator       = VK_NULL_HANDLE;

    VkSwapchainKHR            swapchain      = VK_NULL_HANDLE;
    VkFormat                  swapFormat     = VK_FORMAT_UNDEFINED;
    VkExtent2D                swapExtent     = {};
    std::vector<VkImage>      swapImages;
    std::vector<VkImageView>  swapViews;

    FrameData          frames[FRAMES_IN_FLIGHT];
    uint32_t           frameIdx        = 0;
    bool               needsResize     = false;
    uint64_t           tick            = 0;
};

// ---------- Vulkan initialization ----------

static void initInstance(App& a) {
    VkApplicationInfo ai{VK_STRUCTURE_TYPE_APPLICATION_INFO};
    ai.pApplicationName = "vk-starter";
    ai.apiVersion       = VK_API_VERSION_1_3;

    // SDL3 tells us which instance extensions we need for presentation.
    uint32_t sdlExtCount = 0;
    const char* const* sdlExts = SDL_Vulkan_GetInstanceExtensions(&sdlExtCount);
    std::vector<const char*> extensions(sdlExts, sdlExts + sdlExtCount);

    std::vector<const char*> layers;
#ifdef APP_USE_VALIDATION
    layers.push_back("VK_LAYER_KHRONOS_validation");
#endif

    VkInstanceCreateInfo ci{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
    ci.pApplicationInfo        = &ai;
    ci.enabledExtensionCount   = uint32_t(extensions.size());
    ci.ppEnabledExtensionNames = extensions.data();
    ci.enabledLayerCount       = uint32_t(layers.size());
    ci.ppEnabledLayerNames     = layers.data();

    VK_CHECK(vkCreateInstance(&ci, nullptr, &a.instance));
}

static void initSurface(App& a) {
    if (!SDL_Vulkan_CreateSurface(a.window, a.instance, nullptr, &a.surface)) {
        std::fprintf(stderr, "SDL_Vulkan_CreateSurface failed: %s\n", SDL_GetError());
        std::abort();
    }
}

static void pickPhysicalDevice(App& a) {
    uint32_t n = 0;
    vkEnumeratePhysicalDevices(a.instance, &n, nullptr);
    std::vector<VkPhysicalDevice> devs(n);
    vkEnumeratePhysicalDevices(a.instance, &n, devs.data());

    for (auto pd : devs) {
        VkPhysicalDeviceProperties props{};
        vkGetPhysicalDeviceProperties(pd, &props);
        if (props.apiVersion < VK_API_VERSION_1_3) continue;

        uint32_t extCount = 0;
        vkEnumerateDeviceExtensionProperties(pd, nullptr, &extCount, nullptr);
        std::vector<VkExtensionProperties> exts(extCount);
        vkEnumerateDeviceExtensionProperties(pd, nullptr, &extCount, exts.data());
        bool hasSwapchain = false;
        for (auto& e : exts)
            if (std::strcmp(e.extensionName, VK_KHR_SWAPCHAIN_EXTENSION_NAME) == 0)
                hasSwapchain = true;
        if (!hasSwapchain) continue;

        uint32_t qfc = 0;
        vkGetPhysicalDeviceQueueFamilyProperties(pd, &qfc, nullptr);
        std::vector<VkQueueFamilyProperties> qfs(qfc);
        vkGetPhysicalDeviceQueueFamilyProperties(pd, &qfc, qfs.data());
        for (uint32_t i = 0; i < qfc; ++i) {
            VkBool32 present = VK_FALSE;
            vkGetPhysicalDeviceSurfaceSupportKHR(pd, i, a.surface, &present);
            if ((qfs[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) && present) {
                a.physical    = pd;
                a.queueFamily = i;
                return;
            }
        }
    }
    std::fprintf(stderr, "No suitable Vulkan 1.3 device with graphics+present found\n");
    std::abort();
}

static void initDevice(App& a) {
    float prio = 1.0f;
    VkDeviceQueueCreateInfo qci{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO};
    qci.queueFamilyIndex = a.queueFamily;
    qci.queueCount       = 1;
    qci.pQueuePriorities = &prio;

    VkPhysicalDeviceVulkan13Features f13{VK_STRUCTURE_TYPE_PHYSICAL_DEVICE_VULKAN_1_3_FEATURES};
    f13.synchronization2 = VK_TRUE;
    f13.dynamicRendering = VK_TRUE; // not used here, but handy later

    const char* devExts[] = { VK_KHR_SWAPCHAIN_EXTENSION_NAME };

    VkDeviceCreateInfo dci{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
    dci.pNext                   = &f13;
    dci.queueCreateInfoCount    = 1;
    dci.pQueueCreateInfos       = &qci;
    dci.enabledExtensionCount   = 1;
    dci.ppEnabledExtensionNames = devExts;

    VK_CHECK(vkCreateDevice(a.physical, &dci, nullptr, &a.device));
    vkGetDeviceQueue(a.device, a.queueFamily, 0, &a.queue);
}

static void initAllocator(App& a) {
    VmaAllocatorCreateInfo aci{};
    aci.physicalDevice = a.physical;
    aci.device         = a.device;
    aci.instance       = a.instance;
    aci.vulkanApiVersion = VK_API_VERSION_1_3;
    VK_CHECK(vmaCreateAllocator(&aci, &a.allocator));
}

// ---------- Swapchain ----------

static void createSwapchain(App& a) {
    VkSurfaceCapabilitiesKHR caps{};
    vkGetPhysicalDeviceSurfaceCapabilitiesKHR(a.physical, a.surface, &caps);

    uint32_t fmtCount = 0;
    vkGetPhysicalDeviceSurfaceFormatsKHR(a.physical, a.surface, &fmtCount, nullptr);
    std::vector<VkSurfaceFormatKHR> formats(fmtCount);
    vkGetPhysicalDeviceSurfaceFormatsKHR(a.physical, a.surface, &fmtCount, formats.data());

    VkSurfaceFormatKHR chosen = formats[0];
    for (auto& f : formats) {
        if (f.format == VK_FORMAT_B8G8R8A8_UNORM &&
            f.colorSpace == VK_COLOR_SPACE_SRGB_NONLINEAR_KHR) {
            chosen = f;
            break;
        }
    }
    a.swapFormat = chosen.format;

    VkExtent2D extent = caps.currentExtent;
    if (extent.width == std::numeric_limits<uint32_t>::max()) {
        int w, h;
        SDL_GetWindowSizeInPixels(a.window, &w, &h);
        extent.width  = std::clamp(uint32_t(w), caps.minImageExtent.width,  caps.maxImageExtent.width);
        extent.height = std::clamp(uint32_t(h), caps.minImageExtent.height, caps.maxImageExtent.height);
    }
    a.swapExtent = extent;

    uint32_t imageCount = caps.minImageCount + 1;
    if (caps.maxImageCount > 0 && imageCount > caps.maxImageCount)
        imageCount = caps.maxImageCount;

    VkSwapchainCreateInfoKHR sci{VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR};
    sci.surface          = a.surface;
    sci.minImageCount    = imageCount;
    sci.imageFormat      = chosen.format;
    sci.imageColorSpace  = chosen.colorSpace;
    sci.imageExtent      = extent;
    sci.imageArrayLayers = 1;
    // TRANSFER_DST so we can vkCmdClearColorImage directly into it.
    sci.imageUsage       = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT |
                           VK_IMAGE_USAGE_TRANSFER_DST_BIT;
    sci.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
    sci.preTransform     = caps.currentTransform;
    sci.compositeAlpha   = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR;
    sci.presentMode      = VK_PRESENT_MODE_FIFO_KHR; // always available
    sci.clipped          = VK_TRUE;

    VK_CHECK(vkCreateSwapchainKHR(a.device, &sci, nullptr, &a.swapchain));

    uint32_t n = 0;
    vkGetSwapchainImagesKHR(a.device, a.swapchain, &n, nullptr);
    a.swapImages.resize(n);
    vkGetSwapchainImagesKHR(a.device, a.swapchain, &n, a.swapImages.data());

    a.swapViews.resize(n);
    for (uint32_t i = 0; i < n; ++i) {
        VkImageViewCreateInfo vci{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
        vci.image    = a.swapImages[i];
        vci.viewType = VK_IMAGE_VIEW_TYPE_2D;
        vci.format   = chosen.format;
        vci.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
        vci.subresourceRange.levelCount = 1;
        vci.subresourceRange.layerCount = 1;
        VK_CHECK(vkCreateImageView(a.device, &vci, nullptr, &a.swapViews[i]));
    }
}

static void destroySwapchain(App& a) {
    for (auto v : a.swapViews) vkDestroyImageView(a.device, v, nullptr);
    a.swapViews.clear();
    a.swapImages.clear();
    if (a.swapchain) vkDestroySwapchainKHR(a.device, a.swapchain, nullptr);
    a.swapchain = VK_NULL_HANDLE;
}

static void recreateSwapchain(App& a) {
    vkDeviceWaitIdle(a.device);
    destroySwapchain(a);
    createSwapchain(a);
}

// ---------- Frame data ----------

static void initFrames(App& a) {
    for (uint32_t i = 0; i < FRAMES_IN_FLIGHT; ++i) {
        VkCommandPoolCreateInfo pci{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
        pci.flags            = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
        pci.queueFamilyIndex = a.queueFamily;
        VK_CHECK(vkCreateCommandPool(a.device, &pci, nullptr, &a.frames[i].pool));

        VkCommandBufferAllocateInfo cbi{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
        cbi.commandPool        = a.frames[i].pool;
        cbi.level              = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
        cbi.commandBufferCount = 1;
        VK_CHECK(vkAllocateCommandBuffers(a.device, &cbi, &a.frames[i].cmd));

        VkSemaphoreCreateInfo sem{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
        VK_CHECK(vkCreateSemaphore(a.device, &sem, nullptr, &a.frames[i].imageReady));
        VK_CHECK(vkCreateSemaphore(a.device, &sem, nullptr, &a.frames[i].renderDone));

        VkFenceCreateInfo fen{VK_STRUCTURE_TYPE_FENCE_CREATE_INFO};
        fen.flags = VK_FENCE_CREATE_SIGNALED_BIT;
        VK_CHECK(vkCreateFence(a.device, &fen, nullptr, &a.frames[i].inFlight));
    }
}

// ---------- Drawing ----------

// sync2 image barrier helper
static void imageBarrier(VkCommandBuffer cmd, VkImage img,
                         VkImageLayout oldL, VkImageLayout newL,
                         VkPipelineStageFlags2 srcStage, VkAccessFlags2 srcAccess,
                         VkPipelineStageFlags2 dstStage, VkAccessFlags2 dstAccess) {
    VkImageMemoryBarrier2 b{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER_2};
    b.srcStageMask  = srcStage;
    b.srcAccessMask = srcAccess;
    b.dstStageMask  = dstStage;
    b.dstAccessMask = dstAccess;
    b.oldLayout     = oldL;
    b.newLayout     = newL;
    b.image         = img;
    b.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    b.subresourceRange.levelCount = 1;
    b.subresourceRange.layerCount = 1;

    VkDependencyInfo dep{VK_STRUCTURE_TYPE_DEPENDENCY_INFO};
    dep.imageMemoryBarrierCount = 1;
    dep.pImageMemoryBarriers    = &b;
    vkCmdPipelineBarrier2(cmd, &dep);
}

static void drawFrame(App& a) {
    FrameData& f = a.frames[a.frameIdx];

    VK_CHECK(vkWaitForFences(a.device, 1, &f.inFlight, VK_TRUE, UINT64_MAX));

    uint32_t imgIdx = 0;
    VkResult acq = vkAcquireNextImageKHR(a.device, a.swapchain, UINT64_MAX,
                                         f.imageReady, VK_NULL_HANDLE, &imgIdx);
    if (acq == VK_ERROR_OUT_OF_DATE_KHR) { a.needsResize = true; return; }
    if (acq != VK_SUCCESS && acq != VK_SUBOPTIMAL_KHR) VK_CHECK(acq);

    VK_CHECK(vkResetFences(a.device, 1, &f.inFlight));
    VK_CHECK(vkResetCommandBuffer(f.cmd, 0));

    VkCommandBufferBeginInfo bi{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    bi.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    VK_CHECK(vkBeginCommandBuffer(f.cmd, &bi));

    VkImage img = a.swapImages[imgIdx];

    // UNDEFINED -> TRANSFER_DST_OPTIMAL
    imageBarrier(f.cmd, img,
                 VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
                 VK_PIPELINE_STAGE_2_TOP_OF_PIPE_BIT, 0,
                 VK_PIPELINE_STAGE_2_CLEAR_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT);

    // Clear to a time-varying color so you can *see* the thing is alive.
    float t = float(a.tick++) * 0.01f;
    VkClearColorValue clearColor{};
    clearColor.float32[0] = 0.5f + 0.5f * std::sin(t);
    clearColor.float32[1] = 0.5f + 0.5f * std::sin(t + 2.0f);
    clearColor.float32[2] = 0.5f + 0.5f * std::sin(t + 4.0f);
    clearColor.float32[3] = 1.0f;

    VkImageSubresourceRange range{};
    range.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    range.levelCount = 1;
    range.layerCount = 1;
    vkCmdClearColorImage(f.cmd, img, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,
                         &clearColor, 1, &range);

    // TRANSFER_DST_OPTIMAL -> PRESENT_SRC_KHR
    imageBarrier(f.cmd, img,
                 VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,
                 VK_PIPELINE_STAGE_2_CLEAR_BIT, VK_ACCESS_2_TRANSFER_WRITE_BIT,
                 VK_PIPELINE_STAGE_2_BOTTOM_OF_PIPE_BIT, 0);

    VK_CHECK(vkEndCommandBuffer(f.cmd));

    VkSemaphoreSubmitInfo waitSem{VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO};
    waitSem.semaphore = f.imageReady;
    waitSem.stageMask = VK_PIPELINE_STAGE_2_COLOR_ATTACHMENT_OUTPUT_BIT;

    VkSemaphoreSubmitInfo signalSem{VK_STRUCTURE_TYPE_SEMAPHORE_SUBMIT_INFO};
    signalSem.semaphore = f.renderDone;
    signalSem.stageMask = VK_PIPELINE_STAGE_2_ALL_GRAPHICS_BIT;

    VkCommandBufferSubmitInfo cbs{VK_STRUCTURE_TYPE_COMMAND_BUFFER_SUBMIT_INFO};
    cbs.commandBuffer = f.cmd;

    VkSubmitInfo2 si{VK_STRUCTURE_TYPE_SUBMIT_INFO_2};
    si.waitSemaphoreInfoCount   = 1;
    si.pWaitSemaphoreInfos      = &waitSem;
    si.commandBufferInfoCount   = 1;
    si.pCommandBufferInfos      = &cbs;
    si.signalSemaphoreInfoCount = 1;
    si.pSignalSemaphoreInfos    = &signalSem;
    VK_CHECK(vkQueueSubmit2(a.queue, 1, &si, f.inFlight));

    VkPresentInfoKHR pi{VK_STRUCTURE_TYPE_PRESENT_INFO_KHR};
    pi.waitSemaphoreCount = 1;
    pi.pWaitSemaphores    = &f.renderDone;
    pi.swapchainCount     = 1;
    pi.pSwapchains        = &a.swapchain;
    pi.pImageIndices      = &imgIdx;
    VkResult pres = vkQueuePresentKHR(a.queue, &pi);
    if (pres == VK_ERROR_OUT_OF_DATE_KHR || pres == VK_SUBOPTIMAL_KHR) {
        a.needsResize = true;
    } else {
        VK_CHECK(pres);
    }

    a.frameIdx = (a.frameIdx + 1) % FRAMES_IN_FLIGHT;
}

// ---------- Cleanup ----------

static void cleanup(App& a) {
    if (a.device) vkDeviceWaitIdle(a.device);

    for (auto& f : a.frames) {
        if (f.inFlight)   vkDestroyFence(a.device, f.inFlight, nullptr);
        if (f.renderDone) vkDestroySemaphore(a.device, f.renderDone, nullptr);
        if (f.imageReady) vkDestroySemaphore(a.device, f.imageReady, nullptr);
        if (f.pool)       vkDestroyCommandPool(a.device, f.pool, nullptr);
    }
    destroySwapchain(a);
    if (a.allocator) vmaDestroyAllocator(a.allocator);
    if (a.device)    vkDestroyDevice(a.device, nullptr);
    if (a.surface)   SDL_Vulkan_DestroySurface(a.instance, a.surface, nullptr);
    if (a.instance)  vkDestroyInstance(a.instance, nullptr);
    if (a.window)    SDL_DestroyWindow(a.window);
    SDL_Quit();
}

// ---------- Entry ----------

int main(int, char**) {
    App app;

    if (!SDL_Init(SDL_INIT_VIDEO)) {
        std::fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return 1;
    }

    app.window = SDL_CreateWindow(
        "vk-starter", app.width, app.height,
        SDL_WINDOW_VULKAN | SDL_WINDOW_RESIZABLE);
    if (!app.window) {
        std::fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        return 1;
    }

    initInstance(app);
    initSurface(app);
    pickPhysicalDevice(app);
    initDevice(app);
    initAllocator(app);
    createSwapchain(app);
    initFrames(app);

    bool running = true;
    while (running) {
        SDL_Event ev;
        while (SDL_PollEvent(&ev)) {
            if (ev.type == SDL_EVENT_QUIT) running = false;
            if (ev.type == SDL_EVENT_WINDOW_RESIZED) app.needsResize = true;
        }

        if (app.needsResize) {
            recreateSwapchain(app);
            app.needsResize = false;
        }

        drawFrame(app);
    }

    cleanup(app);
    return 0;
}
```

---

## 8. Build and run

From the project root:

```bash
# Windows: set VCPKG_ROOT=C:\path\to\vcpkg
export VCPKG_ROOT=/path/to/vcpkg

cmake --preset default
cmake --build build

./build/app    # or build\app.exe on Windows
```

The first configure will take a while — vcpkg is compiling SDL3, ImGui, and friends. Subsequent configures reuse the cache.

You should get a window filled with a smoothly cycling pastel color. Close the window to quit.

---

## 9. Troubleshooting

- **`find_package(SDL3)` fails.** The toolchain file probably isn't wired in. Confirm `CMAKE_TOOLCHAIN_FILE` in the preset points at `$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake` and that `VCPKG_ROOT` is actually set in the shell you ran `cmake --preset` from.
- **`No suitable Vulkan 1.3 device…`** Update your GPU drivers. On Linux, make sure `mesa-vulkan-drivers` (or the proprietary NVIDIA driver) is current. `vulkaninfo | grep apiVersion` should show 1.3+.
- **Black window, no cycling color.** Validation layer will usually tell you why. Build in Debug (the default preset) and watch stdout/stderr — `VK_LAYER_KHRONOS_validation` is enabled via `APP_USE_VALIDATION`.
- **`SDL_Vulkan_CreateSurface` crashes at link time.** Make sure you `#include <SDL3/SDL_vulkan.h>` and link `SDL3::SDL3` (not the older `SDL3::SDL3-static`-only target).
- **VMA link errors.** You forgot `vma_impl.cpp`, or you defined `VMA_IMPLEMENTATION` in more than one translation unit. It must appear in exactly one `.cpp`.

---

## 10. What's next

You now have the scaffolding. Natural follow-ups:

1. **ImGui integration** — create a descriptor pool, call `ImGui_ImplSDL3_InitForVulkan` and `ImGui_ImplVulkan_Init` (use dynamic rendering since we enabled it), and feed SDL events to `ImGui_ImplSDL3_ProcessEvent` in the poll loop. Render ImGui into the swapchain image between the clear and the present-layout transition.
2. **Dynamic rendering pass** — instead of `vkCmdClearColorImage`, use `vkCmdBeginRendering` with a `VkRenderingAttachmentInfo` whose `loadOp = CLEAR`. That's the path you want once you start drawing geometry.
3. **Per-swapchain-image `renderDone` semaphore.** The current code uses per-frame-in-flight semaphores for both acquire and present, which works but can trip validation in edge cases. The strictly correct pattern is `imageReady` per frame-in-flight, `renderDone` per swapchain image.
4. **Pipeline + triangle** — add shader compilation (`glslc` from the Vulkan SDK), a graphics pipeline, a vertex buffer backed by VMA, and draw glm-transformed geometry.
