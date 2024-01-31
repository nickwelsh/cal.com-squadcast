import type { NextApiRequest, NextApiResponse } from "next";

import { symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import metadata from "../_metadata";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const { apiKey } = req.body;
    // Get user
    const user = await prisma.user.findFirstOrThrow({
      where: {
        id: req.session?.user?.id,
      },
      select: {
        email: true,
        id: true,
      },
    });

    const data = {
      type: metadata.type,
      key: { apiKey: symmetricEncrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "") },
      userId: user.id,
      teamId: null,
      appId: metadata.slug,
      invalid: false,
    };

    try {
      await prisma.credential.create({
        data,
      });
    } catch (reason) {
      logger.error(`Could not add this ${metadata.name} account`, reason);
      return res.status(500).json({ message: `Could not add this ${metadata.name} account` });
    }

    return res
      .status(200)
      .json({ url: getInstalledAppPath({ variant: metadata.variant, slug: metadata.slug }) });
  }

  if (req.method === "GET") {
    return res.status(200).json({ url: `/apps/${metadata.slug}/setup` });
  }
}
