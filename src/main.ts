import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Reflector } from '@nestjs/core';
import {RolesGuard} from "./common/guard/roles.guard";

async function bootstrap() {
    const logger = new Logger('Bootstrap');

    // Create NestJS app
    const app = await NestFactory.create(AppModule);

    // API Prefix
    app.setGlobalPrefix('api/v1.0');

    // -------------------------------
    // Security & Performance Middlewares
    // -------------------------------
    app.use(helmet());             // Secure HTTP headers
    app.use(compression());        // Response compression
    app.use(cookieParser());       // Parse cookies
    app.enableCors({               // Enable CORS
        origin: ['http://localhost:3000'], // Replace with your allowed domains
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        credentials: true,
    });

    // -------------------------------
    // Global Validation Pipe
    // -------------------------------
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,             // Remove extra properties
            transform: true,             // Auto-transform payloads to DTO instances
            forbidNonWhitelisted: true,  // Throw error on unknown properties
        }),
    );

    const reflector = app.get(Reflector);

    app.useGlobalGuards(
        new RolesGuard(reflector),
    );

    // -------------------------------
    // Swagger / OpenAPI Setup
    // -------------------------------
    const swaggerConfig = new DocumentBuilder()
        .setTitle('API')
        .setDescription('API documentation')
        .setVersion('1.0')
        .addBearerAuth() // JWT authentication in Swagger
        .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger docs available at /docs');

    // -------------------------------
    // Start Application
    // -------------------------------
    const port = process.env.PORT || 3000;
    await app.listen(port);
    logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();