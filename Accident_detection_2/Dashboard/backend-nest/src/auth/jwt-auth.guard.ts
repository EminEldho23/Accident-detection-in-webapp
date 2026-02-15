import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// Optional: Use @UseGuards(JwtAuthGuard) on any controller/route
// Example:
// @UseGuards(JwtAuthGuard)
// @Get('protected')
// getProtected() { return { message: 'Authenticated!' }; }
