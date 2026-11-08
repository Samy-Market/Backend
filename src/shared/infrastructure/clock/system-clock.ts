import { Injectable } from '@nestjs/common';
import { APP_TIMEZONE } from '../../../config/app.config';
import { Clock } from '../../application/ports/clock';
import { dayKeyInZone } from '../../domain/calendar';

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
  today(): string {
    return dayKeyInZone(this.now(), APP_TIMEZONE);
  }
}
