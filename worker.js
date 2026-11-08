/* Static asset Worker for Freebuff Sites. The arcade is fully client-side,
   so the Worker only serves the files in ./public. */

export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
