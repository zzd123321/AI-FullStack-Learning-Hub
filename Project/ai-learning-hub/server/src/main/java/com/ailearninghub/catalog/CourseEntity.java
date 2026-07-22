package com.ailearninghub.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "courses")
public class CourseEntity {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "path_id", nullable = false)
  private LearningPathEntity path;
  @Column(nullable = false, length = 120)
  private String title;
  @Column(nullable = false, length = 500)
  private String summary;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
  private ContentStatus status = ContentStatus.DRAFT;
  @Column(name = "sort_order", nullable = false)
  private int sortOrder;

  protected CourseEntity() {}
  public CourseEntity(LearningPathEntity path, String title, String summary, int sortOrder) {
    this.path = path; this.title = title; this.summary = summary; this.sortOrder = sortOrder;
  }
  public Long getId() { return id; }
  public LearningPathEntity getPath() { return path; }
  public String getTitle() { return title; }
  public String getSummary() { return summary; }
  public ContentStatus getStatus() { return status; }
  public int getSortOrder() { return sortOrder; }
  public void update(String title, String summary, int sortOrder) { this.title = title; this.summary = summary; this.sortOrder = sortOrder; }
  public void publish() { this.status = ContentStatus.PUBLISHED; }
  public void archive() { this.status = ContentStatus.ARCHIVED; }
}
