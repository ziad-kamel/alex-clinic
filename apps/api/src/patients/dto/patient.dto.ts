import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  Matches,
} from 'class-validator';

export class CreatePatientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsOptional()
  extraPhone?: string;
}

export class UpdatePatientDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  extraPhone?: string;
}
