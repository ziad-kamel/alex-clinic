import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class CreateSpecializationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  nameAr?: string;
}

export class CreateDoctorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  nameAr?: string;

  @IsString()
  @IsNotEmpty()
  specializationId!: string;
}

export class UpdateDoctorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  nameAr?: string;

  @IsString()
  @IsOptional()
  specializationId?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class SetDoctorScheduleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number; // 0=Sunday, 6=Saturday

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'startTime must be in HH:MM format' })
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'endTime must be in HH:MM format' })
  endTime!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  maxPatients?: number;
}
