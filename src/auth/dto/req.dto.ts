import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, Matches, MaxLength } from "class-validator";

export class SignupReqDto {
  @ApiProperty({required: true, example: 'nestjs@example.com'})
  @IsEmail()
  @MaxLength(30)
  email: string;

  @ApiProperty({required: true, example: 'Password123!'})
  // 최소 10자, 최대 30자, 하나 이상의 대문자, 소문자, 숫자 및 특수 문자 포함
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{10,30}$/)
  password: string;

  @ApiProperty({required: true, example: 'Password123!'})
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{10,30}$/)
  passwordConfirm: string;
}

export class SigninReqDto {
  @ApiProperty({required: true, example: 'nestjs@example.com'})
  @IsEmail()
  @MaxLength(30)
  email: string;

  @ApiProperty({required: true, example: 'Password123!'})
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{10,30}$/)
  password: string;
}