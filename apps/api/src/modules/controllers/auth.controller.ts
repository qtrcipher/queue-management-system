import { Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IsEmail, IsString, MinLength } from "class-validator";
import { CurrentUser } from "../decorators/current-user.decorator.js";
import { SessionGuard, type SessionUser } from "../guards/session.guard.js";
import { AuthService } from "../services/auth.service.js";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(body.email, body.password);
    response.cookie("qms_session", session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12
    });
    return session.user;
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie("qms_session");
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser) {
    return { authenticated: true, user };
  }
}
