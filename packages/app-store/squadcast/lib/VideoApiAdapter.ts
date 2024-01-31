import { z } from "zod";

import { symmetricDecrypt } from "@calcom/lib/crypto";
import getEventTypeById from "@calcom/lib/getEventTypeById";
import prisma from "@calcom/prisma";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import type { PartialReference } from "@calcom/types/EventManager";
import type { VideoApiAdapter, VideoCallData } from "@calcom/types/VideoApiAdapter";

import { getEventTypeAppData } from "../../_utils/getEventTypeAppData";
import metadata from "../_metadata";

const empty = {
  type: "",
  id: "",
  password: "",
  url: "",
};

async function getShowId(eventData: CalendarEvent) {
  if (!eventData || !eventData.eventTypeId || !eventData.organizer.id) return;

  const eventType = await getEventTypeById({
    eventTypeId: eventData.eventTypeId,
    userId: eventData.organizer.id,
    prisma,
    isUserOrganizationAdmin: false,
  });

  // const eventType = await trpc.viewer.eventTypes.get.useQuery({ id: eventData.eventTypeId });
  if (!eventType) return;

  const appData = getEventTypeAppData(eventType.eventType, "squadcast");
  if (!appData) return;

  return appData.showID;
}

function getApiKey(credential: CredentialPayload) {
  if (!credential.key) return;

  const { apiKey } = z
    .object({
      apiKey: z.string(),
    })
    .parse(credential.key);

  return symmetricDecrypt(apiKey, process.env.CALENDSO_ENCRYPTION_KEY || "");
}

async function getData(eventData: CalendarEvent, action: "create" | "update") {
  const data = new URLSearchParams();
  data.append("sessionTitle", eventData.title);
  data.append("date", new Date(eventData.startTime).toISOString().substring(0, 10));
  data.append(
    "startTime",
    new Date(eventData.startTime)
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: action === "create" ? eventData.organizer.timeZone : "UTC",
      })
      .substring(0, 8)
  );
  data.append(
    "endTime",
    new Date(eventData.endTime)
      .toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: action === "create" ? eventData.organizer.timeZone : "UTC",
      })
      .substring(0, 8)
  );
  data.append("timeZone", eventData.organizer.timeZone);

  const showId = await getShowId(eventData);
  if (showId) data.append("showID", showId);

  eventData.attendees.map((person) => {
    data.append("stage", person.email);
  });

  return data;
}

const SquadcastVideoApiAdapter = (credential: CredentialPayload): VideoApiAdapter => {
  return {
    getAvailability: () => {
      return Promise.resolve([]);
    },
    createMeeting: async (eventData: CalendarEvent): Promise<VideoCallData> => {
      const data = await getData(eventData, "create");
      const response = await fetch("https://api.squadcast.fm/v2/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getApiKey(credential)}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: data.toString(),
      });

      if (response.status !== 200) return Promise.resolve(empty);

      const newSession = (await response.json()) as unknown;
      const { sessionID, showID } = z
        .object({
          sessionID: z.string(),
          showID: z.string(),
        })
        .parse(newSession);

      return Promise.resolve({
        type: metadata.type,
        id: sessionID,
        password: "",
        url: `https://app.squadcast.fm/studio/${showID}/session/${sessionID}`,
      });
    },
    deleteMeeting: async (uid: string): Promise<void> => {
      console.log("CANCEL!!!", uid);
      Promise.resolve();
    },
    updateMeeting: async (bookingRef: PartialReference, eventData: CalendarEvent): Promise<VideoCallData> => {
      if (!bookingRef.meetingId) return Promise.resolve(empty);

      const data = await getData(eventData, "update");
      await fetch(`https://api.squadcast.fm/v2/sessions/${bookingRef.meetingId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${getApiKey(credential)}`,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: data.toString(),
      });

      return Promise.resolve({
        type: metadata.type,
        id: bookingRef.meetingId as string,
        password: bookingRef.meetingPassword as string,
        url: bookingRef.meetingUrl as string,
      });
    },
  };
};

export default SquadcastVideoApiAdapter;
