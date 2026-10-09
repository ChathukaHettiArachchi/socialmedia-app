using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SocialConnect.Services;

namespace SocialConnect.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class FilesController : ControllerBase
    {
        private readonly IFileService _fileService;

        public FilesController(IFileService fileService)
        {
            _fileService = fileService;
        }

        [HttpPost("upload")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadFile(IFormFile file, [FromForm] string category = "files")
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "No file selected for upload." });
            }

            try
            {
                var userId = GetCurrentUserId();
                var fileRecord = await _fileService.UploadFileAsync(file, userId, category);
                return Ok(new
                {
                    message = "File uploaded successfully.",
                    fileId = fileRecord.Id,
                    fileName = fileRecord.FileName,
                    fileUrl = fileRecord.FilePath,
                    fileType = fileRecord.FileType,
                    fileSize = fileRecord.FileSize
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred during file upload.", detail = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetFileInfo(Guid id)
        {
            var file = await _fileService.GetFileAsync(id);
            if (file == null)
            {
                return NotFound(new { message = "File record not found." });
            }
            return Ok(file);
        }

        private Guid GetCurrentUserId()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                throw new UnauthorizedAccessException("Invalid authentication claim.");
            }
            return userId;
        }
    }
}
