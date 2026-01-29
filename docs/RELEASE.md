# Release Notes

## Version 2.0.0

### Major New Features 🎉

#### Multi-DB Support

- Added support for managing multiple databases through a single MCP server instance
- Detailed documentation available in [docs/README-MULTI-DB.md](README-MULTI-DB.md)
- Special thanks to [@saarthak-gupta-architect](https://github.com/saarthak-gupta-architect) for this contribution
- Features include:
  - Dynamic database switching
  - Cross-database operations
  - Schema-specific permissions
  - Safe multi-DB mode with optional write protection

### Improvements 🔧

#### Enhanced Logging System

- Added optional logging system controlled by `ENABLE_LOGGING` environment variable
- Log levels: info and error
- Improved debugging capabilities while maintaining clean output when needed
- Set `ENABLE_LOGGING=1` to enable logging, leave unset or set to any other value to disable

#### Query Handling Improvements

- Standardized query case handling to prevent column case sensitivity issues
- All SQL queries are now automatically converted to lowercase before execution
- Improved reliability when working with different MySQL configurations
- Better handling of case-sensitive identifiers

### Breaking Changes ⚠️

- Query handling now consistently uses lowercase, which might affect case-sensitive database configurations
- Logging output format has changed - applications parsing server output may need updates
- Multi-DB support introduces new configuration options that might require updates to existing deployment scripts

### Migration Guide 🔄

1. Update Environment Variables:

   ```bash
   # Optional: Enable logging
   ENABLE_LOGGING=1

   # For Multi-DB support (optional)
   MULTI_DB_WRITE_MODE=true  # Enable write operations in multi-DB mode
   ```

2. Review any case-sensitive database operations in your queries
3. Update any scripts that parse server output to handle the new logging format
4. Check [README-MULTI-DB.md](README-MULTI-DB.md) for multi-database setup instructions if needed

### Contributors 👥

Special thanks to:

- [@saarthak-gupta-architect](https://github.com/saarthak-gupta-architect) - Multi-DB Support
