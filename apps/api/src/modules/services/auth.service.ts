import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { User } from "@prisma/client";
import { verify } from "argon2";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const token = this.sign(`${user.id}.${randomBytes(16).toString("hex")}`);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  }

  async verifySessionToken(token: string | undefined): Promise<Omit<User, "passwordHash">> {
    if (!token) throw new UnauthorizedException("Missing session");

    const parts = token.split(".");
    if (parts.length !== 3) throw new UnauthorizedException("Invalid session");

    const [userId, nonce, signature] = parts;
    if (!userId || !nonce || !signature) throw new UnauthorizedException("Invalid session");

    const value = `${userId}.${nonce}`;
    const expected = this.signature(value);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      throw new UnauthorizedException("Invalid session");
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Invalid session");

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  private sign(value: string) {
    const signature = this.signature(value);
    return `${value}.${signature}`;
  }

  private signature(value: string) {
    const secret = process.env.SESSION_SECRET ?? "development-secret";
    return createHmac("sha256", secret).update(value).digest("hex");
  }
}
