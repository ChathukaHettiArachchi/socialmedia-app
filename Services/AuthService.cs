using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BCrypt.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SocialConnect.Data;
using SocialConnect.DTOs;
using SocialConnect.Models;

namespace SocialConnect.Services
{
    public class AuthService : IAuthService
    {
        private readonly ApplicationDbContext _db;
        private readonly IConfiguration _config;
        private readonly IWebHostEnvironment _env;

        public AuthService(ApplicationDbContext db, IConfiguration config, IWebHostEnvironment env)
        {
            _db = db;
            _config = config;
            _env = env;
        }

        public async Task<AuthResponseDto> RegisterAsync(RegisterDto dto)
        {
            var cleanUsername = dto.Username.Trim().ToLowerInvariant();
            var cleanEmail = dto.Email.Trim().ToLowerInvariant();

            if (await _db.Users.AnyAsync(u => u.Username.ToLower() == cleanUsername))
            {
                throw new InvalidOperationException("Username is already taken.");
            }

            if (await _db.Users.AnyAsync(u => u.Email.ToLower() == cleanEmail))
            {
                throw new InvalidOperationException("Email address is already registered.");
            }

            string? profileImageUrl = null;
            if (dto.ProfilePhoto != null && dto.ProfilePhoto.Length > 0)
            {
                profileImageUrl = await SaveProfilePhotoAsync(dto.ProfilePhoto);
            }

            var passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = dto.Username.Trim(),
                Email = dto.Email.Trim(),
                PasswordHash = passwordHash,
                CreatedAt = DateTime.UtcNow,
                IsOnline = true,
                LastSeenAt = DateTime.UtcNow
            };

            var profile = new UserProfile
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                FullName = dto.FullName.Trim(),
                Bio = dto.Bio?.Trim(),
                ProfileImageUrl = profileImageUrl,
                UpdatedAt = DateTime.UtcNow
            };

            user.Profile = profile;

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            var token = GenerateJwtToken(user, profile);

            return new AuthResponseDto
            {
                Token = token,
                User = MapToUserDto(user, profile),
                Message = "Registration successful"
            };
        }

        public async Task<AuthResponseDto> LoginAsync(LoginDto dto)
        {
            var input = dto.UsernameOrEmail.Trim().ToLowerInvariant();

            var user = await _db.Users
                .Include(u => u.Profile)
                .FirstOrDefaultAsync(u => u.Username.ToLower() == input || u.Email.ToLower() == input);

            if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
            {
                throw new InvalidOperationException("Invalid username/email or password.");
            }

            user.IsOnline = true;
            user.LastSeenAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            var token = GenerateJwtToken(user, user.Profile);

            return new AuthResponseDto
            {
                Token = token,
                User = MapToUserDto(user, user.Profile),
                Message = "Login successful"
            };
        }

        public async Task<UserDto?> GetUserProfileAsync(Guid userId)
        {
            var user = await _db.Users
                .Include(u => u.Profile)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null) return null;

            return MapToUserDto(user, user.Profile);
        }

        public async Task<UserDto> UpdateProfileAsync(Guid userId, UpdateProfileDto dto)
        {
            var user = await _db.Users
                .Include(u => u.Profile)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null)
            {
                throw new KeyNotFoundException("User not found.");
            }

            if (user.Profile == null)
            {
                user.Profile = new UserProfile
                {
                    Id = Guid.NewGuid(),
                    UserId = user.Id,
                    FullName = dto.FullName.Trim(),
                    UpdatedAt = DateTime.UtcNow
                };
            }

            user.Profile.FullName = dto.FullName.Trim();
            user.Profile.Bio = dto.Bio?.Trim();
            user.Profile.UpdatedAt = DateTime.UtcNow;

            if (dto.ProfilePhoto != null && dto.ProfilePhoto.Length > 0)
            {
                user.Profile.ProfileImageUrl = await SaveProfilePhotoAsync(dto.ProfilePhoto);
            }

            if (!string.IsNullOrWhiteSpace(dto.NewPassword))
            {
                if (string.IsNullOrWhiteSpace(dto.CurrentPassword) || !BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
                {
                    throw new InvalidOperationException("Current password is incorrect.");
                }

                if (dto.NewPassword.Length < 6)
                {
                    throw new InvalidOperationException("New password must be at least 6 characters long.");
                }

                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
            }

            await _db.SaveChangesAsync();
            return MapToUserDto(user, user.Profile);
        }

        private async Task<string> SaveProfilePhotoAsync(IFormFile photo)
        {
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".webp" };
            var extension = Path.GetExtension(photo.FileName).ToLowerInvariant();

            if (!allowedExtensions.Contains(extension))
            {
                throw new InvalidOperationException("Only JPG, JPEG, PNG, and WEBP image files are allowed.");
            }

            if (photo.Length > 5 * 1024 * 1024) // 5 MB limit
            {
                throw new InvalidOperationException("Profile photo size must be less than 5MB.");
            }

            var uploadFolder = Path.Combine(_env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads", "profile");
            if (!Directory.Exists(uploadFolder))
            {
                Directory.CreateDirectory(uploadFolder);
            }

            var uniqueFileName = $"{Guid.NewGuid()}{extension}";
            var filePath = Path.Combine(uploadFolder, uniqueFileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await photo.CopyToAsync(stream);
            }

            return $"/uploads/profile/{uniqueFileName}";
        }

        private string GenerateJwtToken(User user, UserProfile? profile)
        {
            var jwtKey = _config["Jwt:Key"] ?? "SuperSecretKeyForSocialConnectApp2026_Minimum32CharsLong!";
            var jwtIssuer = _config["Jwt:Issuer"] ?? "SocialConnect";
            var jwtAudience = _config["Jwt:Audience"] ?? "SocialConnectUsers";

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim("FullName", profile?.FullName ?? user.Username)
            };

            var token = new JwtSecurityToken(
                issuer: jwtIssuer,
                audience: jwtAudience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private static UserDto MapToUserDto(User user, UserProfile? profile)
        {
            return new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                FullName = profile?.FullName ?? user.Username,
                Bio = profile?.Bio,
                ProfileImageUrl = profile?.ProfileImageUrl,
                IsOnline = user.IsOnline,
                LastSeenAt = user.LastSeenAt,
                CreatedAt = user.CreatedAt
            };
        }
    }
}
