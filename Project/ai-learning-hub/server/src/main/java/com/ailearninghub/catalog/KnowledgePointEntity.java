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
@Table(name = "knowledge_points")
public class KnowledgePointEntity {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "course_id", nullable = false)
  private CourseEntity course;
  @Column(nullable = false, length = 160)
  private String title;
  @Column(nullable = false, columnDefinition = "MEDIUMTEXT")
  private String content;
  @Column(name = "estimated_minutes", nullable = false)
  private int estimatedMinutes;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
  private ContentStatus status = ContentStatus.DRAFT;
  @Column(name = "sort_order", nullable = false)
  private int sortOrder;

  protected KnowledgePointEntity() {}
  public KnowledgePointEntity(CourseEntity course, String title, String content, int estimatedMinutes, int sortOrder) {
    this.course = course; this.title = title; this.content = content; this.estimatedMinutes = estimatedMinutes; this.sortOrder = sortOrder;
  }
  public Long getId() { return id; }
  public CourseEntity getCourse() { return course; }
  public String getTitle() { return title; }
  public String getContent() { return content; }
  public int getEstimatedMinutes() { return estimatedMinutes; }
  public ContentStatus getStatus() { return status; }
  public int getSortOrder() { return sortOrder; }
  public void update(String title, String content, int estimatedMinutes, int sortOrder) {
    this.title = title; this.content = content; this.estimatedMinutes = estimatedMinutes; this.sortOrder = sortOrder;
  }
  public void publish() { this.status = ContentStatus.PUBLISHED; }
  public void archive() { this.status = ContentStatus.ARCHIVED; }
}
