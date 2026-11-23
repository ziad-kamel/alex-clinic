import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class PublicBookingDoctorsQueryDto {
  @IsUUID()
  specializationId!: string;
}

export class PublicBookingAvailabilityQueryDto {
  @IsUUID()
  doctorId!: string;

  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  from!: string;

  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  to!: string;
}

export class PublicBookAppointmentDto {
  @IsUUID()
  specializationId!: string;

  @IsUUID()
  doctorId!: string;

  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  appointmentDate!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  @Matches(/^[^\u0000-\u001f\u007f]+$/)
  patientName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  @Matches(/^\+?(?=(?:\D*\d){7})[0-9 ().-]{7,24}$/)
  patientPhone!: string;
}
