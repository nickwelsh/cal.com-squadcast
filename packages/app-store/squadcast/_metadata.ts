import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "SquadCast",
  description: _package.description,
  type: "squadcast_video",
  variant: "conferencing",
  extendsFeature: "EventType",
  categories: ["conferencing"],
  logo: "icon.svg",
  publisher: "Nick Welsh",
  url: "https://squadcast.fm",
  slug: "squadcast",
  isGlobal: false,
  email: "howcanwehelp@integrateforgood.org",
  appData: {
    location: {
      linkType: "dynamic",
      type: "integrations:squadcast",
      label: "SquadCast Video",
    },
  },
  concurrentMeetings: true,
} as AppMeta;

export default metadata;
