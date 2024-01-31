import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { symmetricDecrypt } from "@calcom/lib/crypto";
import { prisma } from "@calcom/prisma";

import metadata from "../_metadata";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      throw new Error("Invalid method");
    }

    if (!req.session?.user?.id) {
      return res.status(401).json({ message: "You must be logged in to do this" });
    }

    const cred = await prisma.credential.findFirst({
      where: {
        AND: [{ type: metadata.type }, { userId: req.session?.user?.id }],
      },
    });

    if (!cred) {
      return res.status(403).json({ message: "You must install the app first" });
    }

    const { apiKey } = z
      .object({
        apiKey: z.string(),
      })
      .parse(cred.key);

    const decryptedApiKey = symmetricDecrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "");

    const fetched = await fetch("https://api.squadcast.fm/v2/shows", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${decryptedApiKey}`,
        Accept: "application/json",
      },
    });

    if (!fetched.ok) {
      return res.status(500).json({ message: "Could not fetch data from Squadcast" });
    }

    const showsSchema = z.array(
      z.object({
        showID: z.string(),
        showDetails: z.object({
          showName: z.string(),
          // showSubtitle: z.string().nullable(),
          // showOwner: z.string(),
          // orgID: z.string(),
          // showImg: z.string().optional(),
          // transferOrgID: z.string().nullable(),
          // memberIDs: z.array(z.string()),
        }),
      })
    );
    const showMap = new Map<string, string>();
    showsSchema.parse(await fetched.json()).forEach((show) => {
      showMap.set(show.showID, show.showDetails.showName);
    });

    return res.status(200).json({ shows: Array.from(showMap) });
  } catch (_err) {
    return res.status(500).json({ message: "Something went wrong" });
  }
}
