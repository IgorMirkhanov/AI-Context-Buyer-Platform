import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtPayload } from './jwt-payload';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: JwtPayload }) {
    return this.auth.me(req.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdateMeDto,
  ) {
    return this.auth.updateMe(req.user.sub, dto.beginnerMode);
  }
}
