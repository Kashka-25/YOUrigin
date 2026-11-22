import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UploadElsewhere } from "./PostMedia";
import type { ClipInfo } from "../../domain/types";

const info = (patch: Partial<ClipInfo>): ClipInfo => ({
  id: "c1",
  name: "reel.mp4",
  mime: "video/mp4",
  bytes: 1,
  width: 1,
  height: 1,
  duration: 1,
  chunkSize: 1,
  chunks: 43,
  uploadedAt: null,
  removedFromCloudAt: null,
  createdAt: 0,
  updatedAt: Date.now(),
  ...patch,
});

describe("a video still uploading from another device", () => {
  it("shows how many pieces are up", () => {
    render(<UploadElsewhere info={info({ uploadedChunks: 38 })} />);
    expect(screen.getByText(/38 of 43 pieces/)).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "88",
    );
  });

  it("says when it has stopped and what to do", () => {
    render(
      <UploadElsewhere
        info={info({
          uploadedChunks: 38,
          updatedAt: Date.now() - 60 * 60 * 1000,
        })}
      />,
    );
    expect(
      screen.getByText(
        /paused at 38 of 43 pieces\. Open YOUrigin there and keep it on screen/,
      ),
    ).toBeTruthy();
  });
});
