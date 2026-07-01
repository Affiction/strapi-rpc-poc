import type { Core } from "@strapi/strapi";

import { buildRpcDocument } from "./rpc/openapi";

export default {
  register({ strapi }: { strapi: Core.Strapi }) {
    const documentationPlugin = strapi.plugin("documentation");

    if (!documentationPlugin) return;

    const { paths, components } = buildRpcDocument();

    // No `pluginOrigin` on purpose: the documentation plugin only applies
    // overrides tagged with a pluginOrigin if that plugin is in its
    // `x-strapi-config.plugins` allowlist (defaults to just upload/
    // users-permissions — see get-plugins-that-need-documentation.js), which
    // would silently drop this override. Omitting it registers unconditionally.
    documentationPlugin.service("override").registerOverride({
      tags: [{ name: "RPC", description: "JSON-RPC proxy methods" }],
      paths,
      components,
    });
  },

  bootstrap(/* { strapi }: { strapi: Core.Strapi } */) {},
};
