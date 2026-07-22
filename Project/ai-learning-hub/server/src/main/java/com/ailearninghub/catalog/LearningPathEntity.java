package com.ailearninghub.catalog;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "learning_paths")
public class LearningPathEntity {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;
  @Column(nullable = false, length = 120)
  private String title;
  @Column(nullable = false, length = 500)
  private String summary;
  @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
  private ContentStatus status = ContentStatus.DRAFT;
  @Column(name = "sort_order", nullable = false)
  private int sortOrder;

  protected LearningPathEntity() {}
  public LearningPathEntity(String title, String summary, int sortOrder) {
    this.title = title; this.summary = summary; this.sortOrder = sortOrder;
  }
  public Long getId() { return id; }
  public String getTitle() { return title; }
  public String getSummary() { return summary; }
  public ContentStatus getStatus() { return status; }
  public int getSortOrder() { return sortOrder; }
  public void update(String title, String summary, int sortOrder) { this.title = title; this.summary = summary; this.sortOrder = sortOrder; }
  public void publish() { this.status = ContentStatus.PUBLISHED; }
  public void archive() { this.status = ContentStatus.ARCHIVED; }
}
