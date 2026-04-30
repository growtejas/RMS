import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasCalendarEventsScope,
  pickGoogleMeetLink,
} from "@/lib/integrations/google-calendar-meet";

describe("google-calendar-meet helpers", () => {
  it("detects calendar.events scope in token scope list", () => {
    assert.equal(
      hasCalendarEventsScope(
        "openid email profile https://www.googleapis.com/auth/calendar.events",
      ),
      true,
    );
    assert.equal(hasCalendarEventsScope("openid email profile"), false);
  });

  it("prefers hangoutLink and falls back to video entry point", () => {
    assert.equal(
      pickGoogleMeetLink({
        hangoutLink: "https://meet.google.com/abc-defg-hij",
      }),
      "https://meet.google.com/abc-defg-hij",
    );
    assert.equal(
      pickGoogleMeetLink({
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+123" },
            {
              entryPointType: "video",
              uri: "https://meet.google.com/xyz-abcd-efg",
            },
          ],
        },
      }),
      "https://meet.google.com/xyz-abcd-efg",
    );
  });
});

