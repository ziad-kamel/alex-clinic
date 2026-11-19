import {
  IsString,
  IsNotEmpty,
  IsUUID,
  Matches,
} from 'class-validator';

export class BookAppointmentDto {
  @IsUUID()
  @IsNotEmpty()
  patientId!: string;

  @IsUUID()
  @IsNotEmpty()
  doctorId!: string;

  // YYYY-MM-DD
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'appointmentDate must be in YYYY-MM-DD format' })
  appointmentDate!: string;
}
