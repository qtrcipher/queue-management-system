import { Injectable, UnauthorizedException } from "@nestjs/common";
import { verify } from "argon2";
import { createHmac, randomBytes } from "node:crypto";
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

  private sign(value: string) {
    const secret = process.env.SESSION_SECRET ?? "development-secret";
    const signature = createHmac("sha256", secret).update(value).digest("hex");
    return `${value}.${signature}`;
  }
}

