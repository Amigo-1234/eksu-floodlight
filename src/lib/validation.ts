import { z } from "zod";

export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number, e.g. +234 803 000 0000");

export const bookingDetailsSchema = z.object({
  activityType: z.enum(["friendly", "training", "practice", "competition", "other"]),
  activityTitle: z.string().trim().max(120, "Max 120 characters").optional().or(z.literal("")),
  teamName: z.string().trim().max(80, "Max 80 characters").optional().or(z.literal("")),
  opponentName: z.string().trim().max(80, "Max 80 characters").optional().or(z.literal("")),
  purpose: z.string().trim().max(300, "Max 300 characters").optional().or(z.literal("")),
  organizerName: z.string().trim().min(2, "Enter the organiser's name").max(120, "Max 120 characters"),
  organizerPhone: phoneSchema.optional().or(z.literal("")),
  organizerEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  notes: z.string().trim().max(1000, "Max 1000 characters").optional().or(z.literal("")),
  publicListing: z.boolean(),
}).superRefine((v, ctx) => {
  if (!v.organizerPhone && !v.organizerEmail) {
    ctx.addIssue({ code: "custom", path: ["organizerPhone"], message: "Add a phone number or an email so the facility can reach you" });
  }
  if (v.activityType === "competition" && !v.activityTitle) {
    ctx.addIssue({ code: "custom", path: ["activityTitle"], message: "Name the competition" });
  }
});
export type BookingDetails = z.infer<typeof bookingDetailsSchema>;
