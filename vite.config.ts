import { defineConfig } from "vite";

// `base: "./"` keeps asset paths relative, so the build works from the
// GitHub Pages project path (/TowerDefense/) as well as any other folder.
export default defineConfig({ base: "./", server: { port: Number(process.env.PORT) || 5173 } });
