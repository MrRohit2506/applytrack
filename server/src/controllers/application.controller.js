import { Application } from "../models/Application.js";
import {
  buildDeadlinePipeline,
  buildFilter,
  buildPagination,
  buildSort,
  serializeApplication,
} from "../services/applicationQuery.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MUTABLE_FIELDS = ["company", "role", "applicationDate", "deadline", "status", "jobUrl", "notes"];
const notFound = () => new AppError(404, "NOT_FOUND", "Application not found.");

// Every query below includes `userId: req.user._id` (from the verified session), never client input.

export const listApplications = asyncHandler(async (req, res) => {
  const q = req.validatedQuery;
  const filter = buildFilter(req.user._id, q);
  const skip = (q.page - 1) * q.limit;

  const fetchPage = () => {
    if (q.sortBy === "deadline") return Application.aggregate(buildDeadlinePipeline(filter, q, skip));
    const query = Application.find(filter).sort(buildSort(q)).skip(skip).limit(q.limit).select("-__v").lean();
    if (q.sortBy === "company") query.collation({ locale: "en", strength: 2 }); // case-insensitive order
    return query;
  };

  const [docs, total] = await Promise.all([fetchPage(), Application.countDocuments(filter)]);
  // A page beyond the last returns an empty list with accurate metadata (the client re-targets the last page).
  res.json({
    data: { applications: docs.map(serializeApplication), pagination: buildPagination(q.page, q.limit, total) },
  });
});

export const createApplication = asyncHandler(async (req, res) => {
  const b = req.body;
  const doc = await Application.create({
    userId: req.user._id,
    company: b.company,
    role: b.role,
    applicationDate: b.applicationDate,
    deadline: b.deadline ?? null,
    status: b.status ?? "Applied",
    jobUrl: b.jobUrl ?? "",
    notes: b.notes ?? "",
  });
  res.status(201).json({ data: { application: serializeApplication(doc.toObject()) } });
});

export const getApplication = asyncHandler(async (req, res) => {
  const doc = await Application.findOne({ _id: req.params.id, userId: req.user._id }).select("-__v").lean();
  if (!doc) throw notFound(); // same response for "missing" and "someone else's"
  res.json({ data: { application: serializeApplication(doc) } });
});

export const updateApplication = asyncHandler(async (req, res) => {
  const updates = {};
  for (const key of MUTABLE_FIELDS) if (key in req.body) updates[key] = req.body[key];

  const doc = await Application.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id }, // ownership enforced inside the query
    { $set: updates },
    { new: true, runValidators: true, lean: true },
  );
  if (!doc) throw notFound();
  res.json({ data: { application: serializeApplication(doc) } });
});

export const deleteApplication = asyncHandler(async (req, res) => {
  const doc = await Application.findOneAndDelete({ _id: req.params.id, userId: req.user._id }).lean();
  if (!doc) throw notFound();
  res.json({ data: { id: String(doc._id), message: "Application deleted." } });
});
