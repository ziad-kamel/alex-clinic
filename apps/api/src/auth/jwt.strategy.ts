import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StaffRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  username: string;
  role: StaffRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: (req: Request) => {
        if (req && req.cookies && req.cookies['staff_token']) {
          return req.cookies['staff_token'];
        }
        if (req && req.headers && req.headers.authorization) {
          const parts = req.headers.authorization.split(' ');
          if (parts.length === 2 && parts[0] === 'Bearer') {
            return parts[1];
          }
        }
        return null;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'alex-clinic-super-secret-jwt-key-development-32chars',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.staffUser.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('User is inactive or not found');
    }
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    };
  }
}
