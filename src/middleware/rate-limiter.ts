import { type Request, type Response, type NextFunction } from "express";
import updateTokenAmount from "../helper/rate-limit.js";

const rateLimiter = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  let receiveAPIKey: string = _req.header("authorization") || "";

  const limitResult = await updateTokenAmount(receiveAPIKey);

  if (limitResult) {
    return next();
  }

  return res.status(429).json({
    success: false,
    message: "Too many request. Please try again later.",
  });
};

export default rateLimiter;
