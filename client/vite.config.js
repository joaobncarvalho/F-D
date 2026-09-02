import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // acessível na LAN — útil para testar em telemóveis reais
  },
  build: {
    rollupOptions: {
      output: {
        // Um só ficheiro de 511 KB significa 8 telemóveis a puxar 511 KB cada um
        // pelo wifi da casa, ao mesmo tempo, no pior momento possível (o início).
        // Separar o que NÃO muda (react, animações, socket) do código do jogo faz
        // com que uma correção a meio da noite só invalide o pedaço pequeno.
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
          rede: ['socket.io-client'],
        },
      },
    },
  },
});
