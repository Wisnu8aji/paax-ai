import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    // Ignore error in non-GCP environments if no credentials are provided
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const internalKey = process.env.INTERNAL_SERVICE_KEY;
  const reqInternalKey = req.header("X-Internal-Key");

  // 1. Service-to-Service auth bypass
  if (internalKey && reqInternalKey === internalKey) {
    const uid = req.header("X-User-Id") || "service-account";
    (req as any).user = { uid };
    return next();
  }

  // 2. Firebase JWT auth
  const authHeader = req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authentication token" });
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (process.env.TESTING === "1" && token.startsWith("test-token-")) {
      const uid = token.replace("test-token-", "");
      (req as any).user = { uid };
      return next();
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = { uid: decodedToken.uid, email: decodedToken.email };
    next();
  } catch (error: any) {
    return res.status(401).json({ error: `Invalid authentication token: ${error.message}` });
  }
}
