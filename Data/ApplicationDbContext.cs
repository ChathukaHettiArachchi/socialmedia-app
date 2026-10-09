using Microsoft.EntityFrameworkCore;
using SocialConnect.Models;

namespace SocialConnect.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
        public DbSet<FriendRequest> FriendRequests => Set<FriendRequest>();
        public DbSet<Connection> Connections => Set<Connection>();
        public DbSet<Conversation> Conversations => Set<Conversation>();
        public DbSet<ConversationParticipant> ConversationParticipants => Set<ConversationParticipant>();
        public DbSet<Message> Messages => Set<Message>();
        public DbSet<FileRecord> Files => Set<FileRecord>();
        public DbSet<Group> Groups => Set<Group>();
        public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
        public DbSet<CallHistory> CallHistories => Set<CallHistory>();
        public DbSet<BlockedUser> BlockedUsers => Set<BlockedUser>();
        public DbSet<Notification> Notifications => Set<Notification>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User Configuration
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(u => u.Username).IsUnique();
                entity.HasIndex(u => u.Email).IsUnique();

                entity.HasOne(u => u.Profile)
                      .WithOne(p => p.User)
                      .HasForeignKey<UserProfile>(p => p.UserId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            // FriendRequest Configuration
            modelBuilder.Entity<FriendRequest>(entity =>
            {
                entity.HasIndex(fr => fr.ReceiverId);
                entity.HasIndex(fr => fr.SenderId);

                entity.HasOne(fr => fr.Sender)
                      .WithMany(u => u.SentFriendRequests)
                      .HasForeignKey(fr => fr.SenderId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(fr => fr.Receiver)
                      .WithMany(u => u.ReceivedFriendRequests)
                      .HasForeignKey(fr => fr.ReceiverId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // Connection Configuration
            modelBuilder.Entity<Connection>(entity =>
            {
                entity.HasIndex(c => new { c.UserId, c.ConnectedUserId }).IsUnique();

                entity.HasOne(c => c.User)
                      .WithMany(u => u.ConnectionsInitiated)
                      .HasForeignKey(c => c.UserId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(c => c.ConnectedUser)
                      .WithMany(u => u.ConnectionsReceived)
                      .HasForeignKey(c => c.ConnectedUserId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // Conversation & Participant Configuration
            modelBuilder.Entity<ConversationParticipant>(entity =>
            {
                entity.HasIndex(cp => cp.UserId);
                entity.HasIndex(cp => cp.ConversationId);

                entity.HasOne(cp => cp.User)
                      .WithMany(u => u.ConversationParticipants)
                      .HasForeignKey(cp => cp.UserId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(cp => cp.Conversation)
                      .WithMany(c => c.Participants)
                      .HasForeignKey(cp => cp.ConversationId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            // Message Configuration
            modelBuilder.Entity<Message>(entity =>
            {
                entity.HasIndex(m => m.ConversationId);
                entity.HasIndex(m => m.CreatedAt);
                entity.HasIndex(m => m.SenderId);

                entity.HasOne(m => m.Sender)
                      .WithMany(u => u.Messages)
                      .HasForeignKey(m => m.SenderId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(m => m.Conversation)
                      .WithMany(c => c.Messages)
                      .HasForeignKey(m => m.ConversationId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(m => m.File)
                      .WithMany()
                      .HasForeignKey(m => m.FileId)
                      .OnDelete(DeleteBehavior.SetNull);
            });

            // FileRecord Configuration
            modelBuilder.Entity<FileRecord>(entity =>
            {
                entity.HasOne(f => f.UploadedBy)
                      .WithMany()
                      .HasForeignKey(f => f.UploadedById)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // Group & Member Configuration
            modelBuilder.Entity<Group>(entity =>
            {
                entity.HasOne(g => g.Conversation)
                      .WithOne(c => c.Group)
                      .HasForeignKey<Group>(g => g.ConversationId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(g => g.CreatedBy)
                      .WithMany()
                      .HasForeignKey(g => g.CreatedById)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<GroupMember>(entity =>
            {
                entity.HasOne(gm => gm.Group)
                      .WithMany(g => g.Members)
                      .HasForeignKey(gm => gm.GroupId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(gm => gm.User)
                      .WithMany(u => u.GroupMemberships)
                      .HasForeignKey(gm => gm.UserId)
                      .OnDelete(DeleteBehavior.Cascade);
            });

            // CallHistory Configuration
            modelBuilder.Entity<CallHistory>(entity =>
            {
                entity.HasOne(ch => ch.Caller)
                      .WithMany()
                      .HasForeignKey(ch => ch.CallerId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(ch => ch.Receiver)
                      .WithMany()
                      .HasForeignKey(ch => ch.ReceiverId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // BlockedUser Configuration
            modelBuilder.Entity<BlockedUser>(entity =>
            {
                entity.HasIndex(b => new { b.BlockerId, b.BlockedUserId }).IsUnique();

                entity.HasOne(b => b.Blocker)
                      .WithMany(u => u.BlockedByMe)
                      .HasForeignKey(b => b.BlockerId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(b => b.Blocked)
                      .WithMany(u => u.BlockedMe)
                      .HasForeignKey(b => b.BlockedUserId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // Notification Configuration
            modelBuilder.Entity<Notification>(entity =>
            {
                entity.HasIndex(n => n.UserId);

                entity.HasOne(n => n.User)
                      .WithMany(u => u.Notifications)
                      .HasForeignKey(n => n.UserId)
                      .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
