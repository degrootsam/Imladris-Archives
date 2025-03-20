---
title: "Building my own AI Agent"
---

I'm going to try to build my own AI-agent and will try to document this process as much as possible.

## Toolkit

I will build my AI agent using the following tools:

- [Rust](https://www.rust-lang.org/learn/get-started)
- [Ollama](https://ollama.com/)
- [Ollama-rs](https://github.com/pepperoni21/ollama-rs)
- [qwen2.5-Coder (7B params)](https://ollama.com/library/qwen2.5-coder)

## Purpose

The AI agent will provide support with

- [x] Code analysis
- [ ] Code generation
- [ ] Managing dependencies
- [ ] Scaffold boilerplate code
- [ ] Initialize projects

![AI analyzing code](<../public/static/gifs/Analyze\ Code.gif>)

### Context

The AI will need to be provided with context to achieve various tasks.

- [ ] Current directory structure
- [ ] Functions for each file in the project

### Ollama

Ollama is a very powerful tool which we'll be using to run our own AI models.
Supported AI models can be found at [Ollama | Models](https://ollama.com/search).

> [!NOTE]
> Not all AI models support tools.
> You can filter on models that can use tools by clicking on the 'Tools' badge underneath the search bar.

#### Basic Setup

```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Sync + Send>> {
    let ollama = Ollama::default(); // Use default settings (localhost:11434)
    let history = vec![];
    let tools = ollama_rs::tool_group![ // Tools for the AI agent to use
        summarize_rust_code,
        summarize_js_or_ts_code,
        summarize_python_code,
        create_file,
        create_directory,
        write_to_file,
    ];
    let model = "qwen2.5-coder".to__string();

    let mut coordinator =
        Coordinator::new_with_tools(ollama, model, history, tools);

    let option = select_option()?;
    if option == "chat" {
        chat_loop(&mut coordinator).await?;
    }

    Ok(())
}
```

1. First the initialize ollama with default settings.
2. Allow the AI agent to store chat history in a Vector
3. Define the tools that the AI agent can use.
4. Starts a simple chat loop

```

```

### Tools

Certain AI models can utilize tools to perform tasks based on the user's input. For example: When the user prompts `Analyze the file at {PATH}`, the agent should have a tool available to read files:

```rust
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
> The AI will decide which tool to use based on the description.
> The more detailed a description is, the more likely it is for the AI agent to utilize the correct tools
