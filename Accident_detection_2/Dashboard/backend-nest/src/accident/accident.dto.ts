import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';

export class CreateAccidentDto {
  @IsString()
  imageBase64: string;

  @IsString()
  gps: string;

  @IsEnum(['low', 'medium', 'high', 'critical'])
  @IsOptional()
  severity?: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsNumber()
  @IsOptional()
  mlConfidence?: number;
}

export class UpdateAccidentDto {
  @IsEnum(['pending', 'dispatched', 'resolved'])
  @IsOptional()
  status?: string;

  @IsEnum(['low', 'medium', 'high', 'critical'])
  @IsOptional()
  severity?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  verified?: boolean;
}
