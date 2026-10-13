import mongoose from "mongoose";

mongoose.set("strictQuery", true);

/** Connects to MongoDB or throws. There is intentionally no mock/fallback mode. */
export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export const isDbConnected = () => mongoose.connection.readyState === 1;
