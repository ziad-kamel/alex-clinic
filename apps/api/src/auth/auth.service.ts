import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.staffUser.findUnique({
      where: { username: dto.username },
    });

    if (!user || !user.active) {
      await this.recordFailedLogin(dto.username);
      throw new UnauthorizedException('Invalid username or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      await this.recordFailedLogin(dto.username);
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      doctorId: user.doctorId,
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        doctorId: user.doctorId,
      },
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.staffUser.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.staffUser.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'STAFF_PASSWORD_CHANGE',
        targetType: 'staff_users',
        targetId: userId,
        details: { username: user.username },
      },
    });

    return { success: true, message: 'Password updated successfully' };
  }

  private async recordFailedLogin(username: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: 'LOGIN_FAILURE',
          targetType: 'staff_users',
          details: { username, timestamp: new Date().toISOString() },
        },
      });
    } catch {
      // prevent audit log failure from suppressing auth response
    }
  }
}
