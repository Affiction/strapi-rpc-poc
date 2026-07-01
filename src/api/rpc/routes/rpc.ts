/**
 * rpc router
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/rpc',
      handler: 'rpc.call',
      config: {
        // Auth left to the default Strapi auth model (users-permissions role
        // grants) — this proxies to actions like banUser/createOrder and must
        // not be publicly reachable. Grant per-role access in the admin panel.
        policies: [],
      },
    },
  ],
};
