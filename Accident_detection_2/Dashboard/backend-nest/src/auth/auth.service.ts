import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

// Hardcoded police users (replace with DB in production)
const POLICE_USERS = [
  { id: '1', username: 'admin', password: 'traffcon360', role: 'admin' },
  { id: '2', username: 'officer1', password: 'police123', role: 'officer' },
];

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = POLICE_USERS.find(
      (u) => u.username === username && u.password === password,
    );
    if (user) {
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    if (!user) {
      return { error: 'Invalid credentials' };
    }
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, username: user.username, role: user.role },
    };
  }
}
