import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ResetTokens } from '../../application/ports/reset-tokens';

@Injectable()
export class CryptoResetTokens extends ResetTokens {
  generate() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
