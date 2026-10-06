import { type Request, type Response, type NextFunction } from "express";
import { isValidAPIKey } from "../helper/api-key.js";

const verifyAPIKeys = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  let receiveAPIKey: string | undefined = _req.header("authorization");

  const m = receiveAPIKey?.trim().match(/^Bearer\s+(.+)$/i);
  const apiKey = m?.[1]?.trim() ?? "";
  if (await isValidAPIKey(apiKey)) {
    (_req as any).apiKey = apiKey;
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Unauthorized or Missing API Key",
  });
};

export default verifyAPIKeys;
