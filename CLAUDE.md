# Project Guidelines for Claude

## Code Quality Standards

### Clean Code Principles
- Write readable, maintainable, and self-documenting code
- Use clear, descriptive variable and function names
- Keep functions focused and single-purpose
- Follow consistent formatting and style conventions
- Remove dead code and unused imports

### Code Organization
- Maintain clear file structure and logical separation of concerns
- Group related functionality together
- Use proper module imports and exports
- Keep files focused and reasonably sized
- Document complex logic with comments when necessary

### No Fallback/Mock Data
- **NEVER** use hardcoded fallback or mock data in production code
- Always fetch real data from actual APIs and databases
- Handle missing data through proper error handling, not fake defaults
- If data is unavailable, fail gracefully with appropriate user feedback
- Test files may use mocks, but production code must use real data sources

### Error Handling
- Implement comprehensive error handling for all API calls and external services
- Provide meaningful error messages to users
- Log errors with sufficient context for debugging
- Use try-catch blocks appropriately
- Handle edge cases and validation errors
- Return appropriate HTTP status codes in API endpoints
- Never let errors fail silently

### Production-Ready Code
- Write code that is ready for production deployment
- Consider security implications (authentication, authorization, data validation)
- Optimize for performance where appropriate
- Handle loading states and user feedback
- Implement proper validation for all user inputs
- Use environment variables for configuration
- Follow security best practices (no exposed secrets, proper sanitization)
- Ensure all code is tested and functional before considering it complete
