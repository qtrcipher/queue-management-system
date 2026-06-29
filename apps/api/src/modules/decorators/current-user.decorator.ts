import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithUser, SessionUser } from "../guards/session.guard.js";

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser | undefined => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
});

