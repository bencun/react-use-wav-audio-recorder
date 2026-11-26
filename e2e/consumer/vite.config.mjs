export default {
  optimizeDeps: {
    exclude: ['react-use-wav-audio-recorder'],
    include: ['react', 'react-dom', 'react-dom/client'],
    // The fixture's dependencies are known up front. Avoid page reloads during recording.
    noDiscovery: true,
  },
};
