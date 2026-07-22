package com.ailearninghub.catalog;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CatalogService {
  private final LearningPathRepository paths;
  private final CourseRepository courses;
  private final KnowledgePointRepository knowledgePoints;

  public CatalogService(LearningPathRepository paths, CourseRepository courses, KnowledgePointRepository knowledgePoints) {
    this.paths = paths;
    this.courses = courses;
    this.knowledgePoints = knowledgePoints;
  }

  public List<CatalogDtos.PathItem> publicPaths() {
    return paths.findByStatusOrderBySortOrderAsc(ContentStatus.PUBLISHED).stream().map(CatalogDtos.PathItem::from).toList();
  }

  public CatalogDtos.PathDetail publicPath(Long id) {
    LearningPathEntity path = publishedPath(id);
    List<CatalogDtos.CourseItem> items = courses.findByPathIdAndStatusOrderBySortOrderAsc(id, ContentStatus.PUBLISHED)
        .stream().map(CatalogDtos.CourseItem::from).toList();
    return new CatalogDtos.PathDetail(CatalogDtos.PathItem.from(path), items);
  }

  public CatalogDtos.CourseDetail publicCourse(Long id) {
    CourseEntity course = publishedCourse(id);
    List<CatalogDtos.KnowledgePointItem> items = knowledgePoints
        .findByCourseIdAndStatusOrderBySortOrderAsc(id, ContentStatus.PUBLISHED).stream()
        .map(CatalogDtos.KnowledgePointItem::from).toList();
    return new CatalogDtos.CourseDetail(CatalogDtos.CourseItem.from(course), items);
  }

  public CatalogDtos.KnowledgePointItem publicKnowledgePoint(Long id) {
    KnowledgePointEntity point = knowledgePoints.findByIdAndStatus(id, ContentStatus.PUBLISHED)
        .orElseThrow(() -> CatalogException.notFound("知识点"));
    if (point.getCourse().getStatus() != ContentStatus.PUBLISHED
        || point.getCourse().getPath().getStatus() != ContentStatus.PUBLISHED) {
      throw CatalogException.notFound("知识点");
    }
    return CatalogDtos.KnowledgePointItem.from(point);
  }

  public List<CatalogDtos.PathItem> adminPaths() { return paths.findAll().stream().map(CatalogDtos.PathItem::from).toList(); }
  public List<CatalogDtos.CourseItem> adminCourses() { return courses.findAll().stream().map(CatalogDtos.CourseItem::from).toList(); }
  public List<CatalogDtos.KnowledgePointItem> adminKnowledgePoints() { return knowledgePoints.findAll().stream().map(CatalogDtos.KnowledgePointItem::from).toList(); }

  @Transactional
  public CatalogDtos.PathItem createPath(CatalogDtos.PathRequest request) {
    return CatalogDtos.PathItem.from(paths.save(new LearningPathEntity(clean(request.title()), clean(request.summary()), request.sortOrder())));
  }

  @Transactional
  public CatalogDtos.PathItem updatePath(Long id, CatalogDtos.PathRequest request) {
    LearningPathEntity path = path(id);
    path.update(clean(request.title()), clean(request.summary()), request.sortOrder());
    return CatalogDtos.PathItem.from(path);
  }

  @Transactional
  public CatalogDtos.CourseItem createCourse(CatalogDtos.CourseRequest request) {
    return CatalogDtos.CourseItem.from(courses.save(new CourseEntity(path(request.pathId()), clean(request.title()), clean(request.summary()), request.sortOrder())));
  }

  @Transactional
  public CatalogDtos.CourseItem updateCourse(Long id, CatalogDtos.CourseRequest request) {
    CourseEntity course = course(id);
    if (!course.getPath().getId().equals(request.pathId())) {
      throw CatalogException.invalidState("第一版不支持将课程移动到另一条学习路线");
    }
    course.update(clean(request.title()), clean(request.summary()), request.sortOrder());
    return CatalogDtos.CourseItem.from(course);
  }

  @Transactional
  public CatalogDtos.KnowledgePointItem createKnowledgePoint(CatalogDtos.KnowledgePointRequest request) {
    return CatalogDtos.KnowledgePointItem.from(knowledgePoints.save(new KnowledgePointEntity(course(request.courseId()), clean(request.title()),
        request.content().trim(), request.estimatedMinutes(), request.sortOrder())));
  }

  @Transactional
  public CatalogDtos.KnowledgePointItem updateKnowledgePoint(Long id, CatalogDtos.KnowledgePointRequest request) {
    KnowledgePointEntity point = knowledgePoint(id);
    if (!point.getCourse().getId().equals(request.courseId())) {
      throw CatalogException.invalidState("第一版不支持将知识点移动到另一门课程");
    }
    point.update(clean(request.title()), request.content().trim(), request.estimatedMinutes(), request.sortOrder());
    return CatalogDtos.KnowledgePointItem.from(point);
  }

  @Transactional
  public CatalogDtos.PathItem publishPath(Long id) { LearningPathEntity path = path(id); path.publish(); return CatalogDtos.PathItem.from(path); }
  @Transactional
  public CatalogDtos.PathItem archivePath(Long id) { LearningPathEntity path = path(id); path.archive(); return CatalogDtos.PathItem.from(path); }
  @Transactional
  public CatalogDtos.CourseItem publishCourse(Long id) {
    CourseEntity course = course(id);
    if (course.getPath().getStatus() != ContentStatus.PUBLISHED) throw CatalogException.invalidState("请先发布所属学习路线");
    course.publish(); return CatalogDtos.CourseItem.from(course);
  }
  @Transactional
  public CatalogDtos.CourseItem archiveCourse(Long id) { CourseEntity course = course(id); course.archive(); return CatalogDtos.CourseItem.from(course); }
  @Transactional
  public CatalogDtos.KnowledgePointItem publishKnowledgePoint(Long id) {
    KnowledgePointEntity point = knowledgePoint(id);
    if (point.getCourse().getStatus() != ContentStatus.PUBLISHED) throw CatalogException.invalidState("请先发布所属课程");
    if (point.getCourse().getPath().getStatus() != ContentStatus.PUBLISHED) throw CatalogException.invalidState("请先发布所属学习路线");
    point.publish(); return CatalogDtos.KnowledgePointItem.from(point);
  }
  @Transactional
  public CatalogDtos.KnowledgePointItem archiveKnowledgePoint(Long id) { KnowledgePointEntity point = knowledgePoint(id); point.archive(); return CatalogDtos.KnowledgePointItem.from(point); }

  private LearningPathEntity publishedPath(Long id) { return paths.findByIdAndStatus(id, ContentStatus.PUBLISHED).orElseThrow(() -> CatalogException.notFound("学习路线")); }
  private CourseEntity publishedCourse(Long id) {
    CourseEntity course = courses.findByIdAndStatus(id, ContentStatus.PUBLISHED).orElseThrow(() -> CatalogException.notFound("课程"));
    if (course.getPath().getStatus() != ContentStatus.PUBLISHED) throw CatalogException.notFound("课程");
    return course;
  }
  private LearningPathEntity path(Long id) { return paths.findById(id).orElseThrow(() -> CatalogException.notFound("学习路线")); }
  private CourseEntity course(Long id) { return courses.findById(id).orElseThrow(() -> CatalogException.notFound("课程")); }
  private KnowledgePointEntity knowledgePoint(Long id) { return knowledgePoints.findById(id).orElseThrow(() -> CatalogException.notFound("知识点")); }
  private static String clean(String value) { return value.trim(); }
}
