# Nest Auth Kit 🚀

A professional, production-ready NestJS Authentication Starter Kit with focus on security, user experience, and clean architecture.

## ✨ Features

- **🛡️ Secure Authentication**: Full JWT-based authentication flow.
- **🔄 Dual Token System**: Access tokens (1h) and Refresh tokens (30d) for seamless user experience.
- **📧 Professional Email OTP**: Real-time email verification and password reset using professional, responsive HTML templates.
- **🔒 Server-Side Logout**: Token blacklisting and refresh token revocation to ensure sessions are truly terminated.
- **🗄️ Database with Prisma**: Optimized PostgreSQL schema with User and EmailOtp models.
- **🧪 Validation & Security**: Input validation using `class-validator` and password hashing with `bcrypt`.

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **Email**: [Nodemailer](https://nodemailer.com/) (Gmail SMTP configured)
- **Security**: [Passport.js](https://www.passportjs.org/), [JWT](https://jwt.io/), [Bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- **Package Manager**: [pnpm](https://pnpm.io/)

## 🚀 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/shakib5560/nest-auth-kit.git
cd nest-auth-kit
pnpm install
```

### 2. Environment Variables
Create a `.env` file from `sample.env`:
```env
DATABASE_URL="postgresql://user:pass@localhost:5433/nest?schema=public"
JWT_SECRET="your_ultra_secret_key"
MAIL_USER="your-email@gmail.com"
MAIL_PASS="your-app-password"
```

### 3. Database Setup
```bash
pnpm prisma migrate dev
```

### 4. Run Application
```bash
# development
pnpm run start:dev

# production
pnpm run build
pnpm run start:prod
```

## 📡 API Endpoints

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| POST | `/auth/signup` | Register new user | Public |
| POST | `/auth/verify-email` | Verify email with OTP | Public |
| POST | `/auth/login` | Login and get tokens | Public |
| POST | `/auth/refresh` | Get new access token | Public |
| POST | `/auth/forgot-password` | Request password reset OTP | Public |
| POST | `/auth/reset-password` | Reset password with OTP | Public |
| GET | `/auth/me` | Get current user profile | Private |
| POST | `/auth/logout` | Logout and revoke tokens | Private |

## 📧 Email Templates
The kit includes professional, responsive HTML templates for:
- Account Verification
- Password Reset

## 📄 License
This project is [MIT licensed](LICENSE).
