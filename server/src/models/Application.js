import mongoose from "mongoose";
import { APPLICATION_STATUSES } from "../constants/applicationStatus.js";

const applicationSchema = new mongoose.Schema(
  {
    // Ownership. Always set from the authenticated session, never from client input.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    company: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    role: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    applicationDate: { type: Date, required: true }, // calendar date stored at UTC midnight
    deadline: { type: Date, default: null }, // optional; null = no deadline
    status: { type: String, enum: APPLICATION_STATUSES, required: true, default: "Applied" },
    jobUrl: { type: String, trim: true, maxlength: 2048, default: "" }, // "" = none
    notes: { type: String, trim: true, maxlength: 2000, default: "" }, // "" = none
  },
  { timestamps: true },
);

// Index decisions (all lead with userId because every query is ownership-scoped):
//  1. (userId, applicationDate desc, _id desc)        default list order + date-range filter.
//  2. (userId, status, applicationDate desc, _id desc) status filter combined with the default order.
//  3. (userId, deadline, _id desc)                     deadline range filter / deadline sort.
// Deliberately NOT indexed: company/role (search is a case-insensitive substring match, which a
// B-tree index cannot serve; it is already narrowed to one user's rows by the userId prefix) and
// jobUrl/notes (never queried). A separate (userId) index would be redundant with the prefixes above.
applicationSchema.index({ userId: 1, applicationDate: -1, _id: -1 });
applicationSchema.index({ userId: 1, status: 1, applicationDate: -1, _id: -1 });
applicationSchema.index({ userId: 1, deadline: 1, _id: -1 });

export const Application =
  mongoose.models.Application || mongoose.model("Application", applicationSchema);
