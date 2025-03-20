import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "Sam de Groot",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "plausible",
    },
    locale: "en-US",
    baseUrl: "degrootsam.github.io/Imladris-Archives",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "created",
    generateSocialImages: true,
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Schibsted Grotesk",
        body: "Source Sans Pro",
        code: "IBM Plex Mono",
      },
      colors: {
        // Inspired by Tokyo
        lightMode: {
          light: "#f8f9fa", // Soft off-white, similar to paper lanterns
          lightgray: "#dcdfe4", // Subtle misty gray
          gray: "#a1a8b1", // Cool steel blue-gray
          darkgray: "#4c566a", // Darker urban gray
          dark: "#2e3440", // Almost black, deep slate
          secondary: "#ff4b5c", // Neon red-pink, inspired by Shibuya nights
          tertiary: "#49a7c5", // Vibrant teal, reflecting Tokyo’s neon lights
          highlight: "rgba(255, 77, 97, 0.15)", // Subtle neon red highlight
          textHighlight: "#ffc85788", // Warm golden neon glow
        },
        darkMode: {
          light: "#1a1c23", // Dark, muted blue-gray for night ambiance
          lightgray: "#343b42", // Cool urban gray
          gray: "#4f5964", // A balance between muted blue and gray
          darkgray: "#d4d7dd", // Lighter cyberpunk metallic silver
          dark: "#eceff4", // Soft white for high contrast
          secondary: "#ff66a3", // Bright neon pink, Akihabara vibes
          tertiary: "#57c7ff", // Electric cyan, cyberpunk aesthetic
          highlight: "rgba(87, 199, 255, 0.15)", // Soft blue neon highlight
          textHighlight: "#ffcc0088", // Vibrant warm neon yellow
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
