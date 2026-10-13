import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // normalisation: stored trimmed + lowercased
      maxlength: 254,
      unique: true, // enforced by a MongoDB unique index
    },
    passwordHash: { type: String, required: true, select: false },
    // Incremented on logout to revoke every outstanding session JWT for this user.
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      // Explicit allow-list: nothing sensitive can leak through res.json(user).
      transform(_doc, ret) {
        return {
          id: String(ret._id),
          name: ret.name,
          email: ret.email,
          createdAt: ret.createdAt,
          updatedAt: ret.updatedAt,
        };
      },
    },
  },
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
