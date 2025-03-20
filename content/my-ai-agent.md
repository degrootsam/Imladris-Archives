---
title: "Building my own AI Agent"
---

I'm going to try to build my own AI-agent and will try to document this process as much as possible.

## Toolkit

I will build my AI agent using the following tools:

- [Rust](https://www.rust-lang.org/learn/get-started)
- [Ollama](https://ollama.com/)
- [qwen2.5-Coder (7B params)](https://ollama.com/library/qwen2.5-coder)

## Purpose

The AI agent will provide support with

- [x] Code analysis
- [ ] Code generation
- [ ] Managing dependencies
- [ ] Scaffold boilerplate code
- [ ] Initialize projects

### Context

The AI will need to be provided with context to achieve various tasks.

- [ ] Current directory structure
- [ ] Functions for each file in the project

### Tools

Certain AI models can utilize tools to perform tasks based on the user's input. For example: When the user prompts `Analyze the file at {PATH}`, the agent should have a tool available to read files:

```rust-lang

/// High-level function that summarizes JavaScript or TypeScript code based on the file type .
#[function]
pub async fn summarize_js_or_ts_code(
    file_path: String,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let path = PathBuf::from(file_path);

    match parse_js_file(&path) {
        Ok(functions) => {
            if functions.is_empty() {
                Ok("No functions found in the file.".to_string())
            } else {
                Ok(format!("Extracted functions:\n{}", functions.join("\n")))
            }
        }
        Err(err) => Ok(format!("Error parsing Rust file: {}", err)),
    }
}
```

The above function uses `parse_js_file()` as a method to parse the content of a Javascript file and is defined as a #[function]. Every tool should be described with a comment.

> [!NOTE]
> The AI will decide which tool to use!
