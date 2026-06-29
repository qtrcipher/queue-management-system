import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { UserRole } from "@prisma/client";
import { AuthService } from "../services/auth.service.js";

export interface SessionUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

export interface RequestWithUser extends Request {
  user?: SessionUser;
  cookies: Record<string, string | undefined>;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    request.user = await this.auth.verifySessionToken(request.cookies.qms_session);
    return true;
  }
}

