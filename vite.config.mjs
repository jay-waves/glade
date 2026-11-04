import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({root:'web',plugins:[tailwindcss()],esbuild:{jsx:'automatic'},build:{outDir:'../dist',emptyOutDir:true,target:'esnext'}});
