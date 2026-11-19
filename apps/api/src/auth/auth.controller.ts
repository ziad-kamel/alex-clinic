import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from './roles.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in staff member and set httpOnly session cookie' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.authService.login(dto);

    res.cookie('staff_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    });

    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear staff authentication cookie' })
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('staff_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated staff user profile' })
  getProfile(@Req() req: Request & { user: any }) {
    return { user: req.user };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current staff user password' })
  async changePassword(
    @Req() req: Request & { user: any },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.id, dto);
  }
}
